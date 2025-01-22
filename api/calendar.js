import express from 'express';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { tokenStore } from './auth.js';

const router = express.Router();

const oauth2Client = new OAuth2Client({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET
});

router.get('/events', async (req, res) => {
  try {
    console.log('1. Starting calendar events fetch...');
    
    // Check session
    const userId = req.cookies.session;
    console.log('2. Session ID:', userId);
    
    if (!userId || !tokenStore.has(userId)) {
      console.log('3. No valid session found');
      return res.status(401).json({ message: 'Not authenticated' });
    }

    // Get stored token
    const userTokens = tokenStore.get(userId);
    console.log('4. User tokens retrieved:', userTokens);

    // Set up oauth client with access token
    oauth2Client.setCredentials({
      access_token: userTokens.access_token
    });
    
    console.log('5. Set OAuth credentials');

    // Create calendar client
    const calendar = google.calendar({ 
      version: 'v3', 
      auth: oauth2Client 
    });
    
    console.log('6. Created calendar client');

    // Get query parameters
    const { date, searchQuery } = req.query;
    
    // Set up time range if date filter is provided
    let timeMin = undefined;
    let timeMax = undefined;
    
    if (date) {
      const selectedDate = new Date(date);
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      timeMin = startOfDay.toISOString();
      timeMax = endOfDay.toISOString();
      
      console.log('7. Fetching events for date range:', {
        start: timeMin,
        end: timeMax
      });
    } else {
      // If no date filter, get events from past month to next 6 months
      const now = new Date();
      const pastMonth = new Date(now);
      pastMonth.setMonth(now.getMonth() - 1);
      const futureMonths = new Date(now);
      futureMonths.setMonth(now.getMonth() + 6);
      
      timeMin = pastMonth.toISOString();
      timeMax = futureMonths.toISOString();
      
      console.log('7. Fetching all events in range:', {
        start: timeMin,
        end: timeMax
      });
    }

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      maxResults: 2500,
      singleEvents: true,
      orderBy: 'startTime',
    });
    
    console.log('8. Events fetched successfully');

    let filteredEvents = response.data.items || [];
    
    // Apply search filter if provided
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filteredEvents = filteredEvents.filter(event => {
        // Get all searchable text fields
        const searchableText = [
          event.summary,
          event.description,
          event.location,
          event.creator?.email,
          ...(event.attendees?.map(a => a.email) || [])
        ].filter(Boolean).join(' ').toLowerCase();

        // Split query into words
        const queryWords = query.split(/\s+/);

        // Check if any word in the query is part of the searchable text
        return queryWords.some(word => searchableText.includes(word));
      });
    }
    
    return res.json({
      events: filteredEvents,
      date: date ? new Date(date) : null
    });

  } catch (error) {
    console.error('Calendar API Error:', {
      message: error.message,
      tokenExists: !!req.cookies.session && tokenStore.has(req.cookies.session),
      userTokens: tokenStore.get(req.cookies.session)
    });
    
    if (error.message.includes('No access') || error.message.includes('invalid_grant')) {
      return res.status(401).json({ 
        message: 'Calendar access needed',
        needsReauth: true 
      });
    }
    
    return res.status(500).json({
      message: 'Error fetching calendar events',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router; 