/**
 * This is a helper file that adds support for the requestUserList event.
 * Copy and add this code to your server.js file after the socket.on('disconnect') event handler.
 */

// Add this code to server.js after the disconnect event handler 
socket.on('requestUserList', ({ roomId }) => {
  console.log(`Client ${socket.id} requested user list for room ${roomId}`);
  
  if (roomId && rooms.has(roomId)) {
    const room = rooms.get(roomId);
    
    // Create user list to send to clients
    const userList = Array.from(room.users.values())
      // Filter out duplicate users (keeping only unique usernames)
      .filter((user, index, self) => 
        index === self.findIndex(u => u.username === user.username)
      )
      .map(user => ({
        id: user.id,
        username: user.username,
        peerId: user.peerId
      }));
    
    console.log(`Sending updated user list for room ${roomId}:`, userList);
    io.to(roomId).emit('userList', userList);
  }
});
