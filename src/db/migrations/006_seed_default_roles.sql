-- Seed Default Roles and Capabilities
-- Inserts administrator and user roles with appropriate capabilities
-- Migration 006

-- Insert roles
INSERT INTO roles (id, name, slug, description) VALUES
(1, 'Administrator', 'administrator', 'Full system access with all capabilities'),
(2, 'User', 'user', 'Standard user with limited access to own data');

-- Insert capabilities

-- User Management Capabilities
INSERT INTO capabilities (name, slug, description, category) VALUES
('List Users', 'users:list', 'View all users in the system', 'users'),
('Create Users', 'users:create', 'Create new user accounts', 'users'),
('Edit Users', 'users:edit', 'Edit any user profile', 'users'),
('Delete Users', 'users:delete', 'Delete user accounts', 'users'),
('Approve Users', 'users:approve', 'Approve pending user registrations', 'users'),
('Deactivate Users', 'users:deactivate', 'Deactivate user accounts', 'users'),
('View User Details', 'users:view', 'View detailed user information', 'users');

-- Role Management Capabilities
INSERT INTO capabilities (name, slug, description, category) VALUES
('Assign Roles', 'roles:assign', 'Assign roles to users', 'roles'),
('Remove Roles', 'roles:remove', 'Remove roles from users', 'roles'),
('Manage Roles', 'roles:manage', 'Create, edit, and delete roles', 'roles');

-- Scraper Management Capabilities
INSERT INTO capabilities (name, slug, description, category) VALUES
('Trigger Scraper', 'scraper:trigger', 'Manually trigger data scraping', 'scraper'),
('View Scraper Logs', 'scraper:logs', 'View scraping history and logs', 'scraper'),
('Configure Scraper', 'scraper:configure', 'Modify scraper settings', 'scraper');

-- Search Capabilities
INSERT INTO capabilities (name, slug, description, category) VALUES
('Create Saved Search', 'searches:create', 'Create saved searches', 'searches'),
('Edit Own Searches', 'searches:edit-own', 'Edit own saved searches', 'searches'),
('Delete Own Searches', 'searches:delete-own', 'Delete own saved searches', 'searches'),
('View Own Searches', 'searches:view-own', 'View own saved searches', 'searches'),
('View All Searches', 'searches:view-all', 'View all users saved searches', 'searches'),
('Manage All Searches', 'searches:manage-all', 'Manage any users saved searches', 'searches');

-- Profile Capabilities
INSERT INTO capabilities (name, slug, description, category) VALUES
('View Own Profile', 'profile:view-own', 'View own user profile', 'profile'),
('Edit Own Profile', 'profile:edit-own', 'Edit own user profile', 'profile'),
('Change Own Password', 'profile:change-password', 'Change own password', 'profile');

-- Notification Capabilities
INSERT INTO capabilities (name, slug, description, category) VALUES
('View Own Notifications', 'notifications:view-own', 'View own notifications', 'notifications'),
('Manage Own Notifications', 'notifications:manage-own', 'Manage notification preferences', 'notifications');

-- Hearing Data Capabilities
INSERT INTO capabilities (name, slug, description, category) VALUES
('View Hearings', 'hearings:view', 'View hearing data (public access)', 'hearings'),
('Export Hearings', 'hearings:export', 'Export hearing data', 'hearings');

-- Audit Capabilities
INSERT INTO capabilities (name, slug, description, category) VALUES
('View Audit Logs', 'audit:view', 'View system audit logs', 'audit'),
('Export Audit Logs', 'audit:export', 'Export audit logs', 'audit');

-- System Administration Capabilities
INSERT INTO capabilities (name, slug, description, category) VALUES
('System Administration', 'system:admin', 'Full system administration access', 'system'),
('View System Info', 'system:info', 'View system information and health', 'system'),
('Manage Settings', 'system:settings', 'Modify system settings', 'system');

-- Assign capabilities to Administrator role (full access)
INSERT INTO role_capabilities (role_id, capability_id)
SELECT 1, id FROM capabilities;

-- Assign capabilities to User role (limited access)
INSERT INTO role_capabilities (role_id, capability_id)
SELECT 2, id FROM capabilities WHERE slug IN (
    'searches:create',
    'searches:edit-own',
    'searches:delete-own',
    'searches:view-own',
    'profile:view-own',
    'profile:edit-own',
    'profile:change-password',
    'notifications:view-own',
    'notifications:manage-own',
    'hearings:view',
    'hearings:export'
);
