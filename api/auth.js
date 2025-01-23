// backend/api/auth.js
import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import fetch from 'node-fetch';

const router = express.Router();

const oauth2Client = new OAuth2Client({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET
});

// Store tokens in memory (use a database in production)
const tokenStore = new Map();

router.post('/google', async (req, res) => {
  try {
    const { access_token } = req.body;
    
    if (!access_token) {
      return res.status(400).json({ message: 'Access token is required' });
    }

    // Get user info from Google
    const userInfoResponse = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      {
        headers: { Authorization: `Bearer ${access_token}` }
      }
    );

    if (!userInfoResponse.ok) {
      throw new Error('Failed to get user info');
    }

    const userData = await userInfoResponse.json();
    const userId = userData.sub;

    // Store token
    tokenStore.set(userId, {
      access_token,
      email: userData.email,
      name: userData.name
    });

    // Set session cookie
    res.cookie('session', userId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'None',
      maxAge: 24 * 60 * 60 * 1000
    });

    return res.status(200).json({
      message: 'Authentication successful',
      user: {
        email: userData.email,
        name: userData.name
      }
    });

  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ 
      message: 'Authentication failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Add fetch calendar events endpoint
router.get('/calendar/events', async (req, res) => {
  try {
    const userId = req.cookies.session;
    if (!userId || !tokenStore.has(userId)) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const userTokens = tokenStore.get(userId);
    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        headers: {
          Authorization: `Bearer ${userTokens.access_token}`
        }
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch calendar events');
    }

    const events = await response.json();
    return res.json(events);

  } catch (error) {
    console.error('Calendar error:', error);
    return res.status(500).json({ message: 'Failed to fetch calendar events' });
  }
});

export { tokenStore };
export default router;