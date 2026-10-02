const users = [];

async function loadUsers() {
  const response = await fetch(chrome.runtime.getURL('users.csv'));
  if (!response.ok) {
    throw new Error('Unable to load users.csv');
  }

  const rows = (await response.text()).split(/\r?\n/);
  const headers = rows.shift().split(',').map(value => value.trim().toLowerCase());
  const envIndex = headers.indexOf('env');
  const userIndex = headers.indexOf('username');
  const passIndex = headers.indexOf('password');
  if (envIndex < 0 || userIndex < 0 || passIndex < 0) {
    throw new Error('users.csv must have env, username, and password columns');
  }

  for (const row of rows) {
    const values = row.split(',').map(value => value.trim());
    const env = values[envIndex];
    const user = values[userIndex];
    const pass = values[passIndex];
    if (!env || !user || !pass) continue;
    users.push({ env, user, pass });
  }

  const envSelect = document.getElementById('envSelect');
  const environments = [...new Set(users.map(({ env }) => env))];
  envSelect.replaceChildren(...environments.map(env => {
    const option = document.createElement('option');
    option.value = env;
    option.textContent = env;
    return option;
  }));
  envSelect.addEventListener('change', updateUsers);
  updateUsers();
}

function updateUsers() {
  const env = document.getElementById('envSelect').value;
  const select = document.getElementById('userSelect');
  const environmentUsers = users.filter(user => user.env === env);
  select.replaceChildren(...environmentUsers.map(({ user, pass }) => {
    const option = document.createElement('option');
    option.value = JSON.stringify({ user, pass });
    option.textContent = user;
    return option;
  }));
}

loadUsers().catch(error => {
  console.error(error);
  alert('Unable to load users.csv.');
});

async function copyCredential(field) {
  const select = document.getElementById('userSelect');
  const status = document.getElementById('copyStatus');
  if (!select.value) {
    status.textContent = 'No users found in users.csv.';
    return;
  }

  const creds = JSON.parse(select.value);
  try {
    await navigator.clipboard.writeText(creds[field]);
    status.textContent = `${field === 'user' ? 'Username' : 'Password'} copied.`;
  } catch (error) {
    console.error(error);
    status.textContent = 'Could not copy to clipboard.';
  }
}

document.getElementById('copyUserBtn').addEventListener('click', () => copyCredential('user'));
document.getElementById('copyPassBtn').addEventListener('click', () => copyCredential('pass'));

document.getElementById('fillBtn').addEventListener('click', async () => {
  const select = document.getElementById('userSelect');
  if (select.value === "") {
    alert("No users found in users.csv.");
    return;
  }
  
  const creds = JSON.parse(select.value);
  
  // Get the active tab
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  
  // Execute the injection
  chrome.scripting.executeScript({
    target: {tabId: tab.id},
    func: (u, p) => {
      // Find inputs, including those inside Shadow DOM (Swagger UI uses these)
      function findInputs() {
        // Standard forms
        let uInput = document.querySelector('input[name="username"], input[name="user"], input[id*="user"]');
        let pInput = document.querySelector('input[name="password"], input[name="pass"], input[id*="pass"]');
        
        // If not found, try searching inside Swagger UI specific containers
        if (!uInput) uInput = document.querySelector('.auth-container input[type="text"]');
        if (!pInput) pInput = document.querySelector('.auth-container input[type="password"]');
        
        return { uInput, pInput };
      }

      const { uInput, pInput } = findInputs();

      if (uInput && pInput) {
        uInput.value = u;
        pInput.value = p;
        // Trigger React/Angular events to ensure the framework sees the change
        uInput.dispatchEvent(new Event('input', { bubbles: true }));
        pInput.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        alert("Login fields not found on this page.");
      }
    },
    args: [creds.user, creds.pass]
  });
});