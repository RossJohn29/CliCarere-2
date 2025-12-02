// QueueDisplay.js - FULL-SCREEN MULTI-SERVICE ROOM DISPLAY
import React, { useState, useEffect } from 'react';
import './QueueDisplay.css';

const QueueDisplay = ({ roomId, roomName, roomNumber }) => {
  const [queueData, setQueueData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchQueueData();
    const interval = setInterval(fetchQueueData, 5000);
    return () => clearInterval(interval);
  }, [roomId]);

  const fetchQueueData = async () => {
    try {
      const response = await fetch(`http://localhost:5000/api/queue/display/room/${roomId}`);
      const data = await response.json();

      if (data.success) {
        setQueueData(data);
        setError(null);
      } else {
        setError(data.message || 'Failed to fetch queue data');
      }
    } catch (err) {
      console.error('Error fetching queue data:', err);
      setError('Unable to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const getColorHex = (colorName) => {
    const colorMap = {
      'Cyan': '#06b6d4', 'Pink': '#ec4899', 'Green': '#22c55e',
      'Yellow': '#eab308', 'Purple': '#a855f7', 'Blue': '#3b82f6',
      'Gray': '#6b7280', 'Orange': '#f97316', 'White': '#64748b',
      'Light Blue': '#7dd3fc', 'Maroon': '#991b1b', 'Brown': '#92400e',
      'Red': '#ef4444', 'Teal': '#14b8a6', 'Navy': '#1e40af',
      'Lime': '#84cc16', 'Olive': '#65a30d', 'Violet': '#8b5cf6',
      'Coral': '#fb7185', 'Sky Blue': '#38bdf8', 'Indigo': '#6366f1',
      'Magenta': '#d946ef', 'Crimson': '#dc2626'
    };
    return colorMap[colorName] || '#1a672a';
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="queue-display-fullscreen">
        <div className="queue-loading">
          <div className="queue-loading-spinner"></div>
          <p>Loading queue display...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="queue-display-fullscreen">
        <div className="queue-error">
          <div className="queue-error-icon">⚠️</div>
          <h2>Connection Error</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="queue-display-fullscreen">
      {/* Header */}
      <header className="queue-header">
        <div className="queue-header-left">
          <div>
            <h1 className="queue-room-name">{queueData?.roomName || roomName}</h1>
            <p className="queue-room-subtitle">{queueData?.roomNumber || roomNumber}</p>
          </div>
        </div>
        
        <div className="queue-header-right">
          <div className="queue-datetime">
            <div className="queue-time">{formatTime(currentTime)}</div>
            <div className="queue-date">{formatDate(currentTime)}</div>
          </div>
        </div>
      </header>

      {/* Main Content - Fixed Split Screen */}
      {queueData?.services && queueData.services.length > 0 ? (
        <main className="queue-main-split">
          {/* NOW CONSULTING - Top Half */}
          <section className="queue-now-section">
            <h2 className="queue-section-title">NOW CONSULTING</h2>
            <div className="queue-now-grid">
              {queueData.services.map((service) => (
                <div 
                  key={service.departmentId} 
                  className="queue-now-card"
                  style={{ borderLeftColor: getColorHex(service.queueColor) }}
                >
                  <div className="queue-service-name-label">
                    <span style={{ color: getColorHex(service.queueColor) }}>
                      {service.serviceName}
                    </span>
                  </div>
                  
                  {service.current ? (
                    <div className="queue-now-number">
                      {service.current.queue_no}
                    </div>
                  ) : (
                    <div className="queue-now-empty">—</div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* WAITING - Bottom Half */}
          <section className="queue-waiting-section">
            <h2 className="queue-section-title">WAITING PATIENTS</h2>
            <div className="queue-waiting-grid">
              {queueData.services.map((service) => (
                <div 
                  key={`wait-${service.departmentId}`}
                  className="queue-waiting-card"
                  style={{ borderLeftColor: getColorHex(service.queueColor) }}
                >
                  <div className="queue-waiting-header">
                    <span 
                      className="queue-waiting-service-name"
                      style={{ color: getColorHex(service.queueColor) }}
                    >
                      {service.serviceName}
                    </span>
                    <span 
                      className="queue-waiting-count-badge"
                      style={{ backgroundColor: getColorHex(service.queueColor) }}
                    >
                      {service.stats.totalWaiting}
                    </span>
                  </div>
                  
                  {service.waiting && service.waiting.length > 0 ? (
                    <div className="queue-waiting-list">
                      {service.waiting.slice(0, 6).map((patient, idx) => (
                        <span 
                          key={patient.queue_no}
                          className={`queue-waiting-num ${idx === 0 ? 'next' : ''}`}
                          style={idx === 0 ? { 
                            backgroundColor: getColorHex(service.queueColor),
                            color: '#fff'
                          } : {}}
                        >
                          {patient.queue_no}
                        </span>
                      ))}
                      {service.waiting.length > 6 && (
                        <span className="queue-waiting-more">
                          +{service.waiting.length - 6}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="queue-no-waiting">No patients waiting</div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </main>
      ) : (
        <div className="queue-no-services">
          <div className="queue-no-services-icon">🏥</div>
          <p>No services operating in this room today</p>
        </div>
      )}

      {/* Refresh Indicator */}
      <div className="queue-refresh-indicator">
        <div className="queue-refresh-dot"></div>
        <span>Auto-refreshing</span>
      </div>
    </div>
  );
};

export default QueueDisplay;