export const errorHandler = (err, req, res, next) => {
    console.error('Error:', err);
  
    // Handle Google API errors
    if (err.code === 401) {
      return res.status(401).json({
        message: 'Authentication failed or token expired'
      });
    }
  
    if (err.code === 403) {
      return res.status(403).json({
        message: 'Permission denied to access calendar'
      });
    }
  
    // Default error response
    res.status(err.status || 500).json({
      message: err.message || 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? err : {}
    });
  };