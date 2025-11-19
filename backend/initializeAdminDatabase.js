// initializeAdminDatabase.js - Database Setup Script for Admin System
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Supabase client setup
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase configuration. Please check your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Function to hash password
const hashPassword = async (password) => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

// Function to create admin table if it doesn't exist
const createAdminTable = async () => {
  console.log('🔍 Checking if healthadmin table exists...');
  
  // First, check if table exists by trying to select from it
  const { data, error } = await supabase
    .from('healthAdmin')
    .select('id')
    .limit(1);

  if (error && error.code === '42P01') {
    // Table doesn't exist, create it
    console.log('📄 Creating healthAdmin table...');
    
    const { error: createError } = await supabase.rpc('exec', {
      sql: `
        CREATE TABLE IF NOT EXISTS "healthAdmin" (
          id SERIAL PRIMARY KEY,
          healthadmin_id VARCHAR(50) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          name VARCHAR(100) NOT NULL,
          position VARCHAR(100) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          last_login TIMESTAMP WITH TIME ZONE,
          active BOOLEAN DEFAULT TRUE
        );

        -- Create indexes for better performance
        CREATE INDEX IF NOT EXISTS idx_healthAdmin_healthadmin_id ON "healthAdmin"(healthadmin_id);
        CREATE INDEX IF NOT EXISTS idx_healthAdmin_active ON "healthAdmin"(active);

        -- Create updated_at trigger
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $ language 'plpgsql';

        CREATE TRIGGER update_healthAdmin_updated_at
          BEFORE UPDATE ON "healthAdmin"
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
      `
    });

    if (createError) {
      console.error('❌ Error creating table:', createError);
      return false;
    }

    console.log('✅ healthAdmin table created successfully');
    return true;
  } else if (error) {
    console.error('❌ Error checking table:', error);
    return false;
  } else {
    console.log('✅ healthAdmin table already exists');
    return true;
  }
};

// Function to insert sample admin data
const insertSampleAdmins = async () => {
  console.log('👤 Checking existing admins...');

  // Check if any admins exist
  const { data: existingAdmins, error: checkError } = await supabase
    .from('healthAdmin')
    .select('healthadmin_id')
    .limit(5);

  if (checkError) {
    console.error('❌ Error checking existing admins:', checkError);
    return false;
  }

  if (existingAdmins && existingAdmins.length > 0) {
    console.log('📋 Found existing admins:');
    existingAdmins.forEach(admin => {
      console.log(`   - ${admin.healthadmin_id}`);
    });
    console.log('ℹ️  Skipping sample data insertion');
    return true;
  }

  console.log('➕ Inserting sample admin data...');

  // Sample admin data matching the database schema from the image
  const sampleAdmins = [
    {
      healthadmin_id: 'ADMIN001',
      password: await hashPassword('admin123'), // Default password: admin123
      name: 'Administrator John Smith',
      position: 'System Administrator'
    },
    {
      healthadmin_id: 'ADMIN002',
      password: await hashPassword('admin456'), // Default password: admin456
      name: 'Administrator Jane Doe',
      position: 'Department Manager'
    },
    {
      healthadmin_id: 'test001',
      password: await hashPassword('test001'), // Default password: test001
      name: 'Ross John',
      position: 'Anything'
    }
  ];

  try {
    const { data, error } = await supabase
      .from('healthAdmin')
      .insert(sampleAdmins)
      .select();

    if (error) {
      console.error('❌ Error inserting sample data:', error);
      return false;
    }

    console.log('✅ Sample admin data inserted successfully:');
    data.forEach(admin => {
      console.log(`   - ${admin.healthadmin_id}: ${admin.name} (${admin.position})`);
    });

    return true;
  } catch (error) {
    console.error('❌ Error during data insertion:', error);
    return false;
  }
};

// Function to verify admin login
const verifyAdminLogin = async (adminId, password) => {
  console.log(`🔍 Testing login for ${adminId}...`);

  const { data: admin, error } = await supabase
    .from('healthAdmin')
    .select('*')
    .eq('healthadmin_id', adminId)
    .single();

  if (error || !admin) {
    console.log(`❌ Admin ${adminId} not found`);
    return false;
  }

  const isValidPassword = await bcrypt.compare(password, admin.password);
  
  if (isValidPassword) {
    console.log(`✅ Login test successful for ${adminId}`);
    return true;
  } else {
    console.log(`❌ Invalid password for ${adminId}`);
    return false;
  }
};

// Main initialization function
const initializeDatabase = async () => {
  console.log('🚀 Starting CLICARE Admin Database Initialization...\n');

  try {
    // Step 1: Create admin table
    const tableCreated = await createAdminTable();
    if (!tableCreated) {
      throw new Error('Failed to create admin table');
    }

    // Step 2: Insert sample data
    const dataInserted = await insertSampleAdmins();
    if (!dataInserted) {
      throw new Error('Failed to insert sample data');
    }

    // Step 3: Test login functionality
    console.log('\n🧪 Testing admin login functionality...');
    await verifyAdminLogin('ADMIN001', 'admin123');
    await verifyAdminLogin('ADMIN002', 'admin456');
    await verifyAdminLogin('test001', 'test001');

    console.log('\n🎉 Database initialization completed successfully!');
    console.log('\n📋 Default Admin Accounts:');
    console.log('   1. ID: ADMIN001, Password: admin123 (System Administrator)');
    console.log('   2. ID: ADMIN002, Password: admin456 (Department Manager)');
    console.log('   3. ID: test001, Password: test001 (Test Account)');
    console.log('\n⚠️  IMPORTANT: Change these default passwords in production!');

  } catch (error) {
    console.error('\n❌ Database initialization failed:', error.message);
    process.exit(1);
  }
};

// Function to reset admin passwords (utility function)
const resetAdminPassword = async (adminId, newPassword) => {
  console.log(`🔄 Resetting password for ${adminId}...`);

  const hashedPassword = await hashPassword(newPassword);

  const { error } = await supabase
    .from('healthAdmin')
    .update({ password: hashedPassword, updated_at: new Date().toISOString() })
    .eq('healthadmin_id', adminId);

  if (error) {
    console.error(`❌ Error resetting password for ${adminId}:`, error);
    return false;
  }

  console.log(`✅ Password reset successfully for ${adminId}`);
  return true;
};

// Export functions for use in other scripts
module.exports = {
  initializeDatabase,
  resetAdminPassword,
  verifyAdminLogin
};

// Run initialization if this file is executed directly
if (require.main === module) {
  initializeDatabase();
}