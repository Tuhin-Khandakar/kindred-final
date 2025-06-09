const socket = io('/');
const videoGrid = document.getElementById('video-grid');
const myPeer = new Peer(undefined, {
  host: '/',
  port: 3001,
  path: '/peerjs'
});

const peers = {};
let myVideoStream, myScreenStream;
let myName = '';
while (!myName || myName.trim() === '') { myName = prompt("What's your name?"); }


const myVideoContainer = document.createElement('div');
myVideoContainer.id = 'my-video-container';
myVideoContainer.classList.add('video-container');

const myVideo = document.createElement('video');
myVideo.muted = true;

// Get Camera and Mic
navigator.mediaDevices.getUserMedia({
  video: true,
  audio: true
}).then(stream => {
  myVideoStream = stream;
  addVideoStream(myVideoContainer, myVideo, stream);

  myPeer.on('call', call => {
    call.answer(stream);
    const peerVideoContainer = document.createElement('div');
    peerVideoContainer.classList.add('video-container');
    const video = document.createElement('video');
    call.on('stream', userVideoStream => {
      addVideoStream(peerVideoContainer, video, userVideoStream);
    });
    call.on('close', () => {
        peerVideoContainer.remove();
    });
    peers[call.peer] = call;
  });

  socket.on('user-connected', userId => {
    setTimeout(() => { connectToNewUser(userId, stream); }, 1000);
  });
});

socket.on('user-disconnected', userId => {
  if (peers[userId]) peers[userId].close();
});

myPeer.on('open', id => {
  socket.emit('join-room', ROOM_ID, id);
});

function connectToNewUser(userId, stream) {
  const call = myPeer.call(userId, stream);
  const peerVideoContainer = document.createElement('div');
  peerVideoContainer.classList.add('video-container');
  const video = document.createElement('video');
  call.on('stream', userVideoStream => {
    addVideoStream(peerVideoContainer, video, userVideoStream);
  });
  call.on('close', () => {
    peerVideoContainer.remove();
  });
  peers[userId] = call;
}

function addVideoStream(container, video, stream) {
  video.srcObject = stream;
  video.addEventListener('loadedmetadata', () => { video.play(); });
  container.append(video);
  if (!document.body.contains(container)) {
    videoGrid.append(container);
  }
}

// ===============================
//      CONTROLS LOGIC
// ===============================

const muteButton = document.getElementById('toggle-mute');
const videoButton = document.getElementById('toggle-video');
const endCallButton = document.getElementById('end-call-btn');
const shareScreenButton = document.getElementById('share-screen-btn');
const cinemaButton = document.getElementById('cinema-btn');
const chatButton = document.getElementById('chat-btn');
const chatPanel = document.getElementById('chat-panel');
const closeChatButton = document.getElementById('close-chat-btn');

// --- Standard Controls ---
muteButton.addEventListener('click', () => {
    const enabled = myVideoStream.getAudioTracks()[0].enabled;
    myVideoStream.getAudioTracks()[0].enabled = !enabled;
    muteButton.classList.toggle('toggled-off', enabled);
});
videoButton.addEventListener('click', () => {
    const enabled = myVideoStream.getVideoTracks()[0].enabled;
    myVideoStream.getVideoTracks()[0].enabled = !enabled;
    videoButton.classList.toggle('toggled-off', enabled);
});
endCallButton.addEventListener('click', () => {
    myPeer.destroy();
    window.location.href = '/';
});

// --- Chat Panel Logic ---
chatButton.addEventListener('click', () => chatPanel.classList.add('open'));
closeChatButton.addEventListener('click', () => chatPanel.classList.remove('open'));
// (Full chat message logic will be added at the end)

// --- Screen Sharing Logic ---
shareScreenButton.addEventListener('click', () => {
  if (myScreenStream && myScreenStream.active) {
    // If we are currently sharing, stop
    stopScreenShare();
  } else {
    // Start sharing
    navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      .then(stream => {
        myScreenStream = stream;
        shareScreenButton.classList.add('toggled-off'); // Use red color to indicate sharing
        
        // Replace our camera track with the screen track for all connected peers
        replaceTracksForAllPeers(myScreenStream);
        
        // Show our screen to ourselves as well
        myVideo.srcObject = myScreenStream;
        
        // Listen for when the user clicks the browser's native "Stop sharing" button
        myScreenStream.getVideoTracks()[0].onended = () => {
            stopScreenShare();
        };
      }).catch(err => {
        console.error('Could not start screen share:', err);
      });
  }
});

function stopScreenShare() {
    if (!myScreenStream) return;
    myScreenStream.getTracks().forEach(track => track.stop());
    shareScreenButton.classList.remove('toggled-off');
    
    // Switch back to camera for all connected peers
    replaceTracksForAllPeers(myVideoStream);
    
    // Switch our own view back to the camera
    myVideo.srcObject = myVideoStream;
    myScreenStream = null;
}

function replaceTracksForAllPeers(stream) {
    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0]; // Use screen share audio if available

    for (let peerId in peers) {
        let peerConnection = peers[peerId].peerConnection;
        
        let videoSender = peerConnection.getSenders().find(s => s.track.kind === 'video');
        if (videoSender) {
            videoSender.replaceTrack(videoTrack);
        }
        
        if (audioTrack) {
            let audioSender = peerConnection.getSenders().find(s => s.track.kind === 'audio');
            if (audioSender) {
                audioSender.replaceTrack(audioTrack);
            }
        }
    }
}


// --- Cinema Mode Logic ---
let ytPlayer;
cinemaButton.addEventListener('click', () => {
    const url = prompt("Paste a YouTube video URL to watch together:");
    if(url) {
        const videoId = getYoutubeVideoId(url);
        if (videoId) {
            socket.emit('cinema:start', { videoId });
            loadCinemaMode(videoId);
        } else {
            alert("Invalid YouTube URL.");
        }
    }
});

socket.on('cinema:start', (data) => {
    loadCinemaMode(data.videoId);
});

function getYoutubeVideoId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

function loadCinemaMode(videoId) {
    videoGrid.style.display = 'none'; // Hide videos
    const cinemaContainer = document.createElement('div');
    cinemaContainer.id = 'cinema-container';
    document.body.appendChild(cinemaContainer);
    
    ytPlayer = new YT.Player('cinema-container', {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: { 'autoplay': 1, 'controls': 1 },
    });
}

// Add chat panel styling (it was missing from previous css)
const style = document.createElement('style');
style.innerHTML = `
#chat-panel { position: fixed; top: 0; right: 0; width: 340px; height: 100%; background: #241e38; display: flex; flex-direction: column; z-index: 300; transform: translateX(100%); transition: transform 0.3s ease-in-out; border-left: 1px solid rgba(155, 135, 255, 0.2); }
#chat-panel.open { transform: translateX(0); }
.chat-header { display: flex; justify-content: space-between; align-items: center; padding: 15px; border-bottom: 1px solid rgba(155, 135, 255, 0.2); }
.close-btn { background: none; border: none; color: white; font-size: 1.5em; cursor: pointer; }
#chat-messages { flex-grow: 1; overflow-y: auto; padding: 15px; }
#chat-form { display: flex; padding: 15px; gap: 10px; border-top: 1px solid rgba(155, 135, 255, 0.2); }
#chat-input { flex-grow: 1; background: #312b47; border: 1px solid #4a3f6b; border-radius: 20px; padding: 10px; color: white; }
.send-btn { background: none; border: none; color: #9b87ff; font-size: 1.2em; cursor: pointer; }
#cinema-container { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 1000; background: #000; }
`;
document.head.appendChild(style);


// Basic chat messaging
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const message = chatInput.value;
  if(message){
    socket.emit('chat:message', { sender: myName, message: message });
    appendChatMessage({ sender: 'You', message: message });
    chatInput.value = '';
  }
});

socket.on('chat:message', data => {
  appendChatMessage(data);
});

function appendChatMessage(data) {
  const messageElement = document.createElement('div');
  messageElement.innerHTML = `<strong>${data.sender}:</strong> ${data.message}`;
  chatMessages.appendChild(messageElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}