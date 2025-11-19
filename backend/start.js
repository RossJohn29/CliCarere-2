// start.js
const { spawn } = require('child_process');
const fs = require('fs');
require('dotenv').config();


const colors = {
  reset: '\x1b[0m', bright: '\x1b[1m', red: '\x1b[31m', green: '\x1b[32m',
  yellow: '\x1b[33m', blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m'
};
const log = (msg, color = 'reset') => console.log(`${colors[color]}${msg}${colors.reset}`);


const checkRequiredFiles = () => {
  const required = ['server.js', 'package.json', '.env'];
  const missing = required.filter(f => !fs.existsSync(f));
  if (missing.length) {
    log('Missing required files:', 'red');
    missing.forEach(f => log(`   - ${f}`, 'red'));
    log('\nPlease ensure all backend files are in place.', 'yellow');
    process.exit(1);
  }
  log('All required files found', 'green');
};


const checkDependencies = () => {
  if (!fs.existsSync('node_modules')) {
    log('Installing dependencies...', 'yellow');
    const install = spawn('npm', ['install'], { stdio: 'inherit', shell: true });
    install.on('close', c => {
      if (c !== 0) { log('Failed to install dependencies', 'red'); process.exit(1); }
      log('Dependencies installed successfully', 'green'); startServer();
    });
  } else { log('Dependencies already installed', 'green'); startServer(); }
};


const checkEnvironment = () => {
  const required = ['REACT_APP_SUPABASE_URL', 'REACT_APP_SUPABASE_ANON_KEY', 'JWT_SECRET'];
  const missing = required.filter(v => !process.env[v]);
  if (missing.length) {
    log('Missing required environment variables:', 'red');
    missing.forEach(v => log(`   - ${v}`, 'red'));
    log('\nPlease check your .env file configuration.', 'yellow');
    return false;
  }
  log('Environment configuration valid', 'green');
  return true;
};


const startServer = () => {
  if (!checkEnvironment()) process.exit(1);
  log('\nStarting CliCare Admin Backend...', 'cyan');
  log('Server at http://localhost:' + (process.env.PORT || '5000'), 'blue');
  log('Press Ctrl+C to stop\n', 'yellow');


  const server = spawn('node', ['server.js'], { stdio: 'inherit', shell: true });
  server.on('close', c => log(c === 0 ? '\nServer stopped gracefully' : `\nServer stopped with code: ${c}`, c === 0 ? 'green' : 'red'));
  server.on('error', e => log(`\nFailed to start server: ${e.message}`, 'red'));


  process.on('SIGINT', () => { log('\nShutting down server...', 'yellow'); server.kill('SIGINT'); });
  process.on('SIGTERM', () => { log('\nShutting down server...', 'yellow'); server.kill('SIGTERM'); });
};


const initializeDatabase = () => new Promise((res, rej) => {
  log('Checking database initialization...', 'yellow');
  const init = spawn('node', ['initializeAdminDatabase.js'], { stdio: 'pipe', shell: true });
  let output = '';
  init.stdout.on('data', d => output += d.toString());
  init.stderr.on('data', d => output += d.toString());
  init.on('close', c => {
    if (c === 0) { log('Database initialization completed', 'green'); res(); }
    else { log('Database initialization failed', 'red'); console.log(output); rej(new Error('Database initialization failed')); }
  });
});


const main = async () => {
  log('CliCare Admin Backend Startup', 'bright');
  log('=====================================', 'cyan');
  try {
    checkRequiredFiles();
    if (fs.existsSync('initializeAdminDatabase.js')) await initializeDatabase();
    checkDependencies();
  } catch (e) { log(`Startup failed: ${e.message}`, 'red'); process.exit(1); }
};


const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  log('CliCare Admin Backend Startup Script', 'bright');
  log('=====================================', 'cyan');
  log('Usage: node start.js [options]', 'blue');
  log('\nOptions:\n  --help, -h     Show this help message\n  --init-db      Initialize database only\n  --check-env    Check environment configuration only', 'yellow');
  log('\nExamples:\n  node start.js              # Start the backend server\n  node start.js --init-db    # Initialize database only\n  node start.js --check-env  # Check environment only', 'blue');
  process.exit(0);
}
if (args.includes('--init-db')) {
  log('Database initialization mode', 'yellow');
  initializeDatabase().then(() => process.exit(0)).catch(() => process.exit(1));
  return;
}
if (args.includes('--check-env')) {
  log('Environment check mode', 'yellow');
  process.exit(checkEnvironment() ? 0 : 1);
  return;
}


main();



