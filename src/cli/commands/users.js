/**
 * User Management Commands
 */

const User = require('../../models/User');
const Role = require('../../models/Role');
const AuthService = require('../../services/auth-service');
const AccountStatus = require('../../models/AccountStatus');
const {
  formatError,
  formatWarning,
  formatInfo,
  createTable,
  createSpinner
} = require('../utils/format');
const { confirm, input, password, select } = require('../utils/prompts');

/**
 * Create a new user
 */
async function createUser(options) {
  try {
    let email, name, userPassword, roleSlug, statusSlug;

    // Interactive mode if no options provided
    if (!options.email) {
      formatInfo('Create New User');
      console.log();

      email = await input('Email:', '', (value) => {
        if (!value || !value.includes('@')) {
          return 'Please enter a valid email address';
        }
        return true;
      });

      name = await input('Full Name:', '', (value) => {
        if (!value || value.length < 1) {
          return 'Please enter a name';
        }
        return true;
      });

      userPassword = await password('Password:', (value) => {
        const validation = AuthService.validatePassword(value);
        if (!validation.valid) {
          return validation.errors.join('\n');
        }
        return true;
      });

      const passwordConfirm = await password('Confirm Password:');
      if (userPassword !== passwordConfirm) {
        formatError('Passwords do not match');
        process.exit(1);
      }

      roleSlug = await select('Role:', [
        { name: 'Administrator (full access)', value: 'administrator' },
        { name: 'User (standard access)', value: 'user' }
      ]);

      statusSlug = await select('Account Status:', [
        { name: 'Active (can log in immediately)', value: 'active' },
        { name: 'Pending Approval (requires admin approval)', value: 'pending' }
      ]);
    } else {
      // Non-interactive mode
      email = options.email;
      name = options.name;
      userPassword = options.password;
      roleSlug = options.role || 'user';
      statusSlug = options.status || 'active';
    }

    const spinner = createSpinner('Creating user...').start();

    // Get status ID
    const status = await AccountStatus.findBySlug(statusSlug);
    if (!status) {
      spinner.fail();
      formatError(`Status "${statusSlug}" not found`);
      process.exit(1);
    }

    // Hash password
    const password_hash = await AuthService.hashPassword(userPassword);

    // Create user
    const user = await User.create({
      email,
      name,
      password_hash,
      status_id: status.id
    });

    // Assign role
    const role = await Role.findBySlug(roleSlug);
    if (!role) {
      spinner.fail();
      formatError(`Role "${roleSlug}" not found`);
      process.exit(1);
    }

    await User.assignRole(user.id, role.id);

    spinner.succeed('User created successfully');
    console.log();
    console.log('User Details:');
    console.log('  ID:', user.id);
    console.log('  Email:', user.email);
    console.log('  Name:', user.name);
    console.log('  Role:', role.name);
    console.log('  Status:', status.name);

    process.exit(0);
  } catch (error) {
    formatError(`Failed to create user: ${error.message}`);
    process.exit(1);
  }
}

/**
 * List all users
 */
async function listUsers(options) {
  try {
    const spinner = createSpinner('Loading users...').start();

    const queryOptions = {
      limit: parseInt(options.limit) || 100,
      offset: 0
    };

    if (options.status) {
      queryOptions.status = options.status;
    }

    if (options.search) {
      queryOptions.search = options.search;
    }

    const users = await User.list(queryOptions);
    const total = await User.count(queryOptions);

    spinner.stop();

    if (users.length === 0) {
      formatInfo('No users found');
      process.exit(0);
    }

    // Create table
    const table = createTable(['ID', 'Email', 'Name', 'Status', 'Created']);

    for (const user of users) {
      // Get roles for each user
      const roles = await User.getRoles(user.id);
      const roleNames = roles.map((r) => r.name).join(', ');

      table.push([
        user.id,
        user.email,
        user.name,
        `${user.status.name}\n${roleNames}`,
        new Date(user.created_at).toLocaleDateString()
      ]);
    }

    console.log();
    console.log(table.toString());
    console.log();
    formatInfo(`Showing ${users.length} of ${total} users`);

    process.exit(0);
  } catch (error) {
    formatError(`Failed to list users: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Approve a pending user
 */
async function approveUser(options) {
  try {
    let userId;

    if (options.id) {
      userId = parseInt(options.id);
    } else if (options.email) {
      const user = await User.findByEmail(options.email);
      if (!user) {
        formatError('User not found');
        process.exit(1);
      }
      userId = user.id;
    } else {
      formatError('Please specify --id or --email');
      process.exit(1);
    }

    const user = await User.findById(userId);
    if (!user) {
      formatError('User not found');
      process.exit(1);
    }

    console.log();
    console.log('User to approve:');
    console.log('  ID:', user.id);
    console.log('  Email:', user.email);
    console.log('  Name:', user.name);
    console.log('  Current Status:', user.status.name);
    console.log();

    if (user.status.slug !== 'pending') {
      formatWarning(`User status is already "${user.status.name}"`);
      const proceed = await confirm('Approve anyway?', false);
      if (!proceed) {
        formatInfo('Cancelled');
        process.exit(0);
      }
    }

    const notes = options.notes || (await input('Notes (optional):', 'Approved via CLI'));

    const confirmed = await confirm('Approve this user?', true);
    if (!confirmed) {
      formatInfo('Cancelled');
      process.exit(0);
    }

    const spinner = createSpinner('Approving user...').start();

    // Change status to active (id = 2)
    await User.changeStatus(userId, 2, null, notes);

    spinner.succeed('User approved successfully');

    // TODO: Send approval email
    formatInfo('Note: Approval email not yet implemented');

    process.exit(0);
  } catch (error) {
    formatError(`Failed to approve user: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Deactivate a user
 */
async function deactivateUser(options) {
  try {
    let userId;

    if (options.id) {
      userId = parseInt(options.id);
    } else if (options.email) {
      const user = await User.findByEmail(options.email);
      if (!user) {
        formatError('User not found');
        process.exit(1);
      }
      userId = user.id;
    } else {
      formatError('Please specify --id or --email');
      process.exit(1);
    }

    const user = await User.findById(userId);
    if (!user) {
      formatError('User not found');
      process.exit(1);
    }

    console.log();
    console.log('User to deactivate:');
    console.log('  ID:', user.id);
    console.log('  Email:', user.email);
    console.log('  Name:', user.name);
    console.log('  Current Status:', user.status.name);
    console.log();

    const notes = options.notes || (await input('Reason for deactivation:', ''));

    const confirmed = await confirm('Deactivate this user?', false);
    if (!confirmed) {
      formatInfo('Cancelled');
      process.exit(0);
    }

    const spinner = createSpinner('Deactivating user...').start();

    // Change status to inactive (id = 3)
    await User.changeStatus(userId, 3, null, notes);

    spinner.succeed('User deactivated successfully');

    process.exit(0);
  } catch (error) {
    formatError(`Failed to deactivate user: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Show user details
 */
async function showUser(options) {
  try {
    let user;

    if (options.id) {
      user = await User.findById(parseInt(options.id));
    } else if (options.email) {
      user = await User.findByEmail(options.email);
    } else {
      formatError('Please specify --id or --email');
      process.exit(1);
    }

    if (!user) {
      formatError('User not found');
      process.exit(1);
    }

    const roles = await User.getRoles(user.id);
    const capabilities = await User.getCapabilities(user.id);
    const history = await AccountStatus.getUserHistory(user.id, 5);

    console.log();
    console.log('User Details:');
    console.log('  ID:', user.id);
    console.log('  Email:', user.email);
    console.log('  Name:', user.name);
    console.log('  Status:', user.status.name, `(${user.status.slug})`);
    console.log('  Created:', new Date(user.created_at).toLocaleString());
    console.log('  Updated:', new Date(user.updated_at).toLocaleString());
    console.log();
    console.log('Roles:', roles.map((r) => r.name).join(', ') || 'None');
    console.log();
    console.log('Capabilities:', capabilities.length);
    if (capabilities.length > 0 && options.verbose) {
      capabilities.forEach((cap) => console.log('  -', cap));
    }

    if (history.length > 0) {
      console.log();
      console.log('Status History:');
      const table = createTable(['Date', 'Status', 'Changed By', 'Notes']);
      history.forEach((h) => {
        table.push([
          new Date(h.changed_at).toLocaleString(),
          h.status_name,
          h.changed_by_name || 'System',
          h.notes || '-'
        ]);
      });
      console.log(table.toString());
    }

    process.exit(0);
  } catch (error) {
    formatError(`Failed to show user: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  createUser,
  listUsers,
  approveUser,
  deactivateUser,
  showUser
};
