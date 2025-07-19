# 🚀 TribesHub Deployment Guide

This guide covers deploying TribesHub to production with all services properly configured.

## 📋 Prerequisites

Before deploying, ensure you have accounts and access to:
- **Database**: [Supabase](https://supabase.com) or [Railway](https://railway.app)
- **Backend**: [Render](https://render.com) or [Railway](https://railway.app)
- **Frontend**: [Vercel](https://vercel.com) or [Netlify](https://netlify.com)
- **Image Storage**: [Cloudinary](https://cloudinary.com)
- **Email**: [SendGrid](https://sendgrid.com)
- **SMS**: [Twilio](https://twilio.com)

## 🗄️ Database Deployment

### Option 1: Supabase (Recommended)

1. **Create Project**
   ```bash
   # Go to https://supabase.com
   # Click "New Project"
   # Choose organization and set project name: "tribeshub"
   # Set database password and region
   ```

2. **Get Connection Details**
   ```bash
   # From Project Settings > Database
   # Copy the connection string (URI format)
   ```

3. **Initialize Database**
   ```bash
   # Update your .env with the Supabase connection string
   DATABASE_URL=postgresql://postgres:[password]@[host]:5432/postgres
   
   # Run initialization script
   cd backend
   npm run init-db
   ```

### Option 2: Railway

1. **Create Database**
   ```bash
   # Go to https://railway.app
   # Click "New Project" > "Provision PostgreSQL"
   # Copy the connection string from Variables tab
   ```

2. **Initialize Database**
   ```bash
   # Update DATABASE_URL in your environment
   # Run the init script
   cd backend
   npm run init-db
   ```

## 🔧 Environment Configuration

### Backend Environment Variables

Create a comprehensive `.env` file for production:

```env
# Database (Use your production database URL)
DATABASE_URL=postgresql://username:password@host:port/database
NODE_ENV=production
PORT=5000

# JWT Security
JWT_SECRET=your-super-secure-jwt-secret-key-with-at-least-32-characters
JWT_EXPIRES_IN=7d

# Cloudinary (Create account at cloudinary.com)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# SendGrid (Create account at sendgrid.com)
SENDGRID_API_KEY=SG.your-sendgrid-api-key
FROM_EMAIL=noreply@yourdomain.com

# Twilio (Create account at twilio.com)
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=+1234567890

# Admin Credentials
ADMIN_EMAIL=avscreation37@gmail.com
ADMIN_PASSWORD=Kalyan@111

# Frontend URL (Will be updated after frontend deployment)
FRONTEND_URL=https://your-frontend-domain.vercel.app
```

## 🖥️ Backend Deployment

### Option 1: Render (Recommended)

1. **Create Web Service**
   ```bash
   # Go to https://render.com
   # Click "New" > "Web Service"
   # Connect your GitHub repository
   ```

2. **Configure Service**
   ```yaml
   Name: tribeshub-backend
   Environment: Node
   Region: Choose closest to your users
   Branch: main
   Root Directory: backend
   Build Command: npm install
   Start Command: node server.js
   ```

3. **Set Environment Variables**
   ```bash
   # In Render dashboard, go to Environment tab
   # Add all variables from your .env file
   # Make sure to set NODE_ENV=production
   ```

4. **Deploy**
   ```bash
   # Click "Create Web Service"
   # Wait for deployment to complete
   # Copy the service URL (e.g., https://tribeshub-backend.onrender.com)
   ```

### Option 2: Railway

1. **Deploy from GitHub**
   ```bash
   # Go to https://railway.app
   # Click "Deploy from GitHub repo"
   # Select your repository
   # Choose backend folder as root
   ```

2. **Configure Variables**
   ```bash
   # In Variables tab, add all environment variables
   # Set start command: node server.js
   ```

## 🌐 Frontend Deployment

### Option 1: Vercel (Recommended)

1. **Connect Repository**
   ```bash
   # Go to https://vercel.com
   # Click "New Project"
   # Import your GitHub repository
   ```

2. **Configure Build Settings**
   ```yaml
   Framework Preset: Create React App
   Root Directory: frontend
   Build Command: npm run build
   Output Directory: build
   Install Command: npm install
   ```

3. **Set Environment Variables**
   ```bash
   # In Project Settings > Environment Variables
   REACT_APP_API_URL=https://your-backend-url.onrender.com/api
   REACT_APP_SOCKET_URL=https://your-backend-url.onrender.com
   ```

4. **Deploy**
   ```bash
   # Click "Deploy"
   # Wait for build to complete
   # Copy the deployment URL
   ```

### Option 2: Netlify

1. **Create Site**
   ```bash
   # Go to https://netlify.com
   # Drag and drop your built frontend folder
   # Or connect via GitHub
   ```

2. **Configure Build**
   ```yaml
   Build command: npm run build
   Publish directory: build
   Base directory: frontend
   ```

3. **Set Environment Variables**
   ```bash
   # In Site Settings > Environment variables
   REACT_APP_API_URL=https://your-backend-url
   REACT_APP_SOCKET_URL=https://your-backend-url
   ```

## 🔗 Update Backend with Frontend URL

After frontend deployment:

1. **Update Backend Environment**
   ```bash
   # In your backend deployment (Render/Railway)
   # Update the FRONTEND_URL variable
   FRONTEND_URL=https://your-frontend-domain.vercel.app
   ```

2. **Redeploy Backend**
   ```bash
   # Trigger a redeploy to apply the new CORS settings
   ```

## 🛠️ Service Configuration

### Cloudinary Setup

1. **Create Account**
   ```bash
   # Go to https://cloudinary.com
   # Sign up for free account
   # Go to Dashboard to get your credentials
   ```

2. **Configure Settings**
   ```bash
   # In Settings > Upload
   # Enable "Use filename as Public ID" if desired
   # Set upload limits as needed
   ```

### SendGrid Setup

1. **Create Account & API Key**
   ```bash
   # Go to https://sendgrid.com
   # Create account and verify email
   # Go to Settings > API Keys
   # Create new API key with Mail Send permissions
   ```

2. **Verify Sender Identity**
   ```bash
   # Go to Settings > Sender Authentication
   # Verify your sender email address
   # This is required to send emails
   ```

### Twilio Setup

1. **Create Account**
   ```bash
   # Go to https://twilio.com
   # Create account and verify phone number
   # Get Account SID and Auth Token from Console
   ```

2. **Get Phone Number**
   ```bash
   # Go to Phone Numbers > Manage > Buy a number
   # Choose a number for sending SMS
   # Copy the phone number to your env vars
   ```

## 🔒 Security Checklist

### Production Security Settings

1. **Environment Variables**
   ```bash
   ✅ All sensitive data in environment variables
   ✅ Strong JWT secret (32+ characters)
   ✅ NODE_ENV=production
   ✅ Database credentials secure
   ```

2. **CORS Configuration**
   ```bash
   ✅ Frontend URL properly set in FRONTEND_URL
   ✅ No wildcard CORS in production
   ✅ HTTPS enforced
   ```

3. **Database Security**
   ```bash
   ✅ Database connection uses SSL
   ✅ Admin user created with strong password
   ✅ Database backup configured
   ```

## 📊 Monitoring & Health Checks

### Backend Health Check
```bash
# Test backend health
curl https://your-backend-url/api/health

# Expected response:
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 123.456
}
```

### Database Connection Test
```bash
# Test database connectivity
# Should see successful connection logs in backend
```

### Real-time Features Test
```bash
# Test Socket.io connection
# Open browser dev tools and check for WebSocket connection
```

## 🚀 Post-Deployment Steps

### 1. Initialize Admin Account
```bash
# The admin account is automatically created during database initialization
# Login credentials:
# Email: avscreation37@gmail.com
# Password: Kalyan@111
```

### 2. Test Core Features
```bash
# Test user registration with OTP
# Test event creation
# Test community creation
# Test real-time chat
# Test admin dashboard access
```

### 3. Configure Monitoring
```bash
# Set up uptime monitoring (UptimeRobot, Pingdom)
# Configure error tracking (Sentry)
# Set up performance monitoring
```

## 🔄 Continuous Deployment

### GitHub Actions (Optional)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production
on:
  push:
    branches: [main]

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to Render
        # Configure Render deployment hook
        run: curl -X POST ${{ secrets.RENDER_DEPLOY_HOOK }}

  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to Vercel
        # Vercel automatically deploys on git push
        run: echo "Frontend deployment triggered"
```

## 🛠️ Troubleshooting

### Common Issues

1. **Database Connection Failed**
   ```bash
   # Check DATABASE_URL format
   # Ensure database is accessible
   # Verify SSL settings for production databases
   ```

2. **CORS Errors**
   ```bash
   # Verify FRONTEND_URL is correctly set
   # Check that both frontend and backend URLs use HTTPS
   # Ensure no trailing slashes in URLs
   ```

3. **Socket.io Connection Issues**
   ```bash
   # Check if WebSocket connections are allowed
   # Verify Socket.io endpoint URLs
   # Check for proxy/firewall blocking WebSockets
   ```

4. **Image Upload Failures**
   ```bash
   # Verify Cloudinary credentials
   # Check file size limits
   # Ensure proper file types are being uploaded
   ```

5. **OTP Not Sending**
   ```bash
   # Verify SendGrid/Twilio credentials
   # Check sender verification status
   # Review API rate limits
   ```

## 📈 Performance Optimization

### Production Optimizations

1. **Database**
   ```bash
   # Enable connection pooling
   # Set appropriate pool sizes
   # Configure query timeouts
   ```

2. **Caching**
   ```bash
   # Implement Redis for session storage
   # Cache frequently accessed data
   # Use CDN for static assets
   ```

3. **Monitoring**
   ```bash
   # Set up application performance monitoring
   # Configure log aggregation
   # Monitor database performance
   ```

## 📞 Support

If you encounter deployment issues:

1. Check the logs in your deployment platform
2. Verify all environment variables are set correctly
3. Test database connectivity separately
4. Review the troubleshooting section above
5. Contact support: avscreation37@gmail.com

---

**🎉 Congratulations! Your TribesHub application is now live in production!**