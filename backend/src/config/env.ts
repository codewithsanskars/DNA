import dotenv from 'dotenv';
dotenv.config();

export const env = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/swfs_portal',
  jwtSecret: process.env.JWT_SECRET || 'swfs_dev_secret_change_in_prod',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  okta: {
    domain: process.env.OKTA_DOMAIN || 'https://mock.okta.com',
    clientId: process.env.OKTA_CLIENT_ID || 'mock_client_id',
    clientSecret: process.env.OKTA_CLIENT_SECRET || 'mock_client_secret',
    redirectUri: process.env.OKTA_REDIRECT_URI || 'http://localhost:5000/api/auth/okta/callback',
  },
  recruitCrm: {
    apiKey: process.env.RECRUIT_CRM_API_KEY || 'mock_recruit_crm_key',
    baseUrl: process.env.RECRUIT_CRM_BASE_URL || 'https://api.recruitcrm.io/v1',
  },
  attio: {
    apiKey: process.env.ATTIO_API_KEY || 'mock_attio_key',
    baseUrl: process.env.ATTIO_BASE_URL || 'https://api.attio.com/v2',
  },
};
