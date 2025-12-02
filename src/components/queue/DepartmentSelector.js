// DepartmentSelector.js - ROOM-BASED with ORIGINAL DESIGN
import React, { useState, useEffect } from 'react';
import './DepartmentSelector.css';

const DepartmentSelector = ({ onSelectRoom }) => {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [hoveredCard, setHoveredCard] = useState(null);

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/rooms');
      const data = await response.json();
      
      if (data.success) {
        setRooms(data.rooms || []);
      }
} catch (error) {
      console.error('Error fetching rooms:', error);
    } finally {
      setLoading(false);
    }
  };

  // Color mapping for each room based on primary service
  const getRoomColor = (roomId) => {
    const colorMap = {
      1: '#06b6d4',  // ENT Clinic - Cyan
      2: '#ec4899',  // OB-Gyne - Pink
      3: '#22c55e',  // Surgery Clinic - Green
      4: '#eab308',  // Pediatric Clinic - Yellow
      5: '#a855f7',  // Medicine Clinic - Purple
      6: '#3b82f6',  // OPD Seniors/PWD - Blue
      7: '#f97316',  // TB DOTS - Orange
      8: '#64748b',  // Dental - White/Gray
      9: '#ef4444'   // Sub Specialty - Red
    };
    return colorMap[roomId] || '#1a672a';
  };

  const getRoomColorName = (roomId) => {
    const colorNameMap = {
      1: 'Cyan',
      2: 'Pink',
      3: 'Green',
      4: 'Yellow',
      5: 'Purple',
      6: 'Blue',
      7: 'Orange',
      8: 'Gray',
      9: 'Red'
    };
    return colorNameMap[roomId] || 'Green';
  };

  const filteredRooms = rooms.filter(room =>
    room.room_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    room.room_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="dept-selector-container">
      <div className="dept-selector-header">
        <h1>Select Room for Queue Display</h1>
      </div>

      <div className="dept-selector-search">
        <input
          type="text"
          placeholder="Search room..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="dept-selector-search-input"
        />
      </div>

      {loading ? (
        <div className="dept-selector-loading">Loading rooms...</div>
      ) : (
        <div className="dept-selector-grid">
          {filteredRooms.map((room) => {
            const colorHex = getRoomColor(room.room_id);
            const colorName = getRoomColorName(room.room_id);
            const isHovered = hoveredCard === room.room_id;
            
            return (
              <div
                key={room.room_id}
                className="dept-selector-card"
                onClick={() => onSelectRoom(room.room_id, room.room_name, room.room_number)}
                onMouseEnter={() => setHoveredCard(room.room_id)}
                onMouseLeave={() => setHoveredCard(null)}
              >
                <div 
                  className="dept-selector-color-bar"
                  style={{ backgroundColor: colorHex }}
                />
                
                <div className="dept-selector-card-content">
                  <div className="dept-selector-card-info">
                    <h3 style={{ color: isHovered ? colorHex : '#111827' }}>
                      {room.room_name}
                    </h3>
                    <div className="dept-selector-room">
                      <svg className="dept-selector-room-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        <polyline points="9 22 9 12 15 12 15 22"></polyline>
                      </svg>
                      <span>{room.room_number}</span>
                    </div>
                  </div>
                  
                  <div 
                    className="dept-selector-color-indicator"
                    style={{ 
                      borderColor: isHovered ? colorHex : '#e5e7eb',
                      color: colorHex
                    }}
                  >
                    <div 
                      className="dept-selector-color-dot"
                      style={{ backgroundColor: colorHex }}
                    />
                    <span 
                      className="dept-selector-color-name"
                      style={{ color: isHovered ? colorHex : '#374151' }}
                    >
                      {colorName}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DepartmentSelector;