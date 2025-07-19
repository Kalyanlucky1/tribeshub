const pool = require('../config/database');
const bcrypt = require('bcryptjs');

const createTables = async () => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        username VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(20),
        password_hash VARCHAR(255) NOT NULL,
        bio TEXT,
        profile_pic VARCHAR(500),
        interests TEXT[],
        country VARCHAR(100),
        state VARCHAR(100),
        city VARCHAR(100),
        points INTEGER DEFAULT 0,
        last_snap_time TIMESTAMP,
        last_login_time TIMESTAMP DEFAULT NOW(),
        email_verified BOOLEAN DEFAULT FALSE,
        phone_verified BOOLEAN DEFAULT FALSE,
        is_admin BOOLEAN DEFAULT FALSE,
        is_suspended BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Events table
    await client.query(`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        event_date DATE NOT NULL,
        event_time TIME NOT NULL,
        location VARCHAR(255),
        image_url VARCHAR(500),
        created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Event participants table
    await client.query(`
      CREATE TABLE IF NOT EXISTS event_participants (
        id SERIAL PRIMARY KEY,
        event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(event_id, user_id)
      )
    `);

    // Communities table
    await client.query(`
      CREATE TABLE IF NOT EXISTS communities (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        image_url VARCHAR(500),
        created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
        member_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Community members table
    await client.query(`
      CREATE TABLE IF NOT EXISTS community_members (
        id SERIAL PRIMARY KEY,
        community_id INTEGER REFERENCES communities(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(50) DEFAULT 'member',
        joined_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(community_id, user_id)
      )
    `);

    // Chat messages table
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        receiver_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        community_id INTEGER REFERENCES communities(id) ON DELETE CASCADE,
        message TEXT,
        image_url VARCHAR(500),
        message_type VARCHAR(50) DEFAULT 'text',
        is_snap BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // OTPs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS otps (
        id SERIAL PRIMARY KEY,
        identifier VARCHAR(255) NOT NULL,
        otp_code VARCHAR(10) NOT NULL,
        type VARCHAR(20) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Activity logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        type VARCHAR(100) NOT NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        details JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Indexes for better performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_id);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_receiver ON chat_messages(receiver_id);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_community ON chat_messages(community_id);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_type ON activity_logs(type);
    `);

    // Create admin user
    const adminEmail = process.env.ADMIN_EMAIL || 'avscreation37@gmail.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Kalyan@111';
    const hashedPassword = await bcrypt.hash(adminPassword, 12);

    await client.query(`
      INSERT INTO users (name, username, email, password_hash, is_admin, email_verified)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = $4,
        is_admin = $5,
        updated_at = NOW()
    `, ['TribesHub Admin', 'admin', adminEmail, hashedPassword, true, true]);

    await client.query('COMMIT');
    console.log('✅ Database tables created successfully!');
    console.log(`✅ Admin user created: ${adminEmail}`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating tables:', error);
    throw error;
  } finally {
    client.release();
  }
};

const initializeDatabase = async () => {
  try {
    await createTables();
    console.log('🎉 Database initialization completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
};

// Run if called directly
if (require.main === module) {
  initializeDatabase();
}

module.exports = { createTables, initializeDatabase };