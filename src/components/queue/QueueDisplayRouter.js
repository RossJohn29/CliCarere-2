// QueueDisplayRouter.js
import React, { useState, useEffect } from 'react';
import QueueDisplay from './QueueDisplay';
import RoomSelector from './DepartmentSelector';

const QueueDisplayRouter = () => {
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [roomName, setRoomName] = useState('');
  const [roomNumber, setRoomNumber] = useState('');

  useEffect(() => {
    const savedRoomId = localStorage.getItem('queueDisplayRoomId');
    const savedRoomName = localStorage.getItem('queueDisplayRoomName');
    const savedRoomNumber = localStorage.getItem('queueDisplayRoomNumber');
    
    if (savedRoomId && savedRoomName) {
      setSelectedRoom(parseInt(savedRoomId));
      setRoomName(savedRoomName);
      setRoomNumber(savedRoomNumber || '');
    }
  }, []);

  const handleSelectRoom = (roomId, roomName, roomNumber) => {
    setSelectedRoom(roomId);
    setRoomName(roomName);
    setRoomNumber(roomNumber);
    
    localStorage.setItem('queueDisplayRoomId', roomId);
    localStorage.setItem('queueDisplayRoomName', roomName);
    localStorage.setItem('queueDisplayRoomNumber', roomNumber);
  };

  const handleResetRoom = () => {
    setSelectedRoom(null);
    setRoomName('');
    setRoomNumber('');
    localStorage.removeItem('queueDisplayRoomId');
    localStorage.removeItem('queueDisplayRoomName');
    localStorage.removeItem('queueDisplayRoomNumber');
  };

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'Escape' && selectedRoom) {
        if (window.confirm('Return to room selection?')) {
          handleResetRoom();
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selectedRoom]);

  if (!selectedRoom) {
    return <RoomSelector onSelectRoom={handleSelectRoom} />;
  }

  return (
    <QueueDisplay 
      roomId={selectedRoom} 
      roomName={roomName}
      roomNumber={roomNumber}
    />
  );
};

export default QueueDisplayRouter;