/**
 * CLI Prompts
 * Helper functions for interactive prompts
 */

const inquirer = require('inquirer');

/**
 * Confirm action
 */
async function confirm(message, defaultValue = false) {
  const answer = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message,
      default: defaultValue
    }
  ]);
  return answer.confirmed;
}

/**
 * Prompt for text input
 */
async function input(message, defaultValue = '', validate = null) {
  const answer = await inquirer.prompt([
    {
      type: 'input',
      name: 'value',
      message,
      default: defaultValue,
      validate: validate || (() => true)
    }
  ]);
  return answer.value;
}

/**
 * Prompt for password
 */
async function password(message, validate = null) {
  const answer = await inquirer.prompt([
    {
      type: 'password',
      name: 'value',
      message,
      mask: '*',
      validate: validate || (() => true)
    }
  ]);
  return answer.value;
}

/**
 * Prompt for selection from list
 */
async function select(message, choices) {
  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'value',
      message,
      choices
    }
  ]);
  return answer.value;
}

/**
 * Prompt for multiple selections
 */
async function checkbox(message, choices) {
  const answer = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'values',
      message,
      choices
    }
  ]);
  return answer.values;
}

module.exports = {
  confirm,
  input,
  password,
  select,
  checkbox
};
