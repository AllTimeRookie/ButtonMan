let socket, peer, dataChannel;
const chatBox = document.getElementById('chat');
const roomInput = document.getElementById('room');
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const fileInput = document.getElementById('fileInput');
const progressBar = document.getElementById('progressBar');

let receivedFile = [];
let receivedFileName = '';
let receivedFileSize = 0;
let receivedBytes = 0;

const CHUNK_SIZE = 64 * 1024; // 64KB chunks

// Set initial status
updateConnectionStatus('disconnected');

function joinRoom() {
  const room = roomInput.value;
  
  if (!room.trim()) {
    alert('Please enter a Room ID');
    return;
  }
  
  updateConnectionStatus('connecting');
  socket = new WebSocket('https://buttonman.onrender.com');

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: "join", room }));
    initPeer(true, room);
    updateConnectionStatus('connected');
    alert(`Joined room: ${room}`);
  };
  
  socket.onerror = () => {
    updateConnectionStatus('error');
    alert('Connection error. Please try again.');
  };
  
  socket.onclose = () => {
    updateConnectionStatus('disconnected');
  };

  socket.onmessage = async ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.type === "offer") await handleOffer(msg);
    else if (msg.type === "answer") await peer.setRemoteDescription(new RTCSessionDescription(msg.answer));
    else if (msg.type === "ice") await peer.addIceCandidate(new RTCIceCandidate(msg.candidate));
  };
}

function initPeer(isCaller, room) {
  peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });

  peer.onicecandidate = e => {
    if (e.candidate) {
      socket.send(JSON.stringify({
        type: "ice", room, payload: { type: "ice", candidate: e.candidate }
      }));
    }
  };

  peer.ondatachannel = e => {
    dataChannel = e.channel;
    dataChannel.bufferedAmountLowThreshold = 0;
    dataChannel.binaryType = "arraybuffer";
    setupChannel();
  };

  if (isCaller) {
    dataChannel = peer.createDataChannel("chat", { bufferedAmountLowThreshold: 0 });
    dataChannel.binaryType = "arraybuffer";
    setupChannel();
    peer.createOffer().then(offer => {
      peer.setLocalDescription(offer);
      socket.send(JSON.stringify({
        type: "offer",
        room,
        payload: { type: "offer", offer }
      }));
    });
  }
}

async function handleOffer({ offer }) {
  initPeer(false, roomInput.value);
  await peer.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);
  socket.send(JSON.stringify({
    type: "answer",
    room: roomInput.value,
    payload: { type: "answer", answer }
  }));
}

function setupChannel() {
  let isReceivingSingleBlobFile = false;
  
  dataChannel.onmessage = async e => {
    const peerTimestamp = new Date().toLocaleString();
    if (typeof e.data === 'string') {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'file-start') {
          receivedFileName = msg.name;
          receivedFileSize = msg.size;
          receivedFile = [];
          receivedBytes = 0;
          progressBar.style.width = '0%';
          isReceivingSingleBlobFile = receivedFileSize <= (100 * 1024 * 1024);
          chatBox.value += `Peer: [${peerTimestamp}] Receiving file: ${receivedFileName} (${(receivedFileSize / (1024 * 1024)).toFixed(2)} MB) ${isReceivingSingleBlobFile ? '[Single Blob]' : '[Chunked]'}\n`;
          console.log(`[Receiver] Received file-start: ${msg.name}, size: ${msg.size}, singleBlob: ${isReceivingSingleBlobFile}`);
        } else if (msg.type === 'file-end') {
          const blob = new Blob(receivedFile);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = receivedFileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          chatBox.value += `Peer: [${peerTimestamp}] File received: ${receivedFileName}\n`;
          progressBar.style.width = '0%';
          isReceivingSingleBlobFile = false;
          console.log(`[Receiver] Received file-end: ${receivedFileName}`);
        } else {
          chatBox.value += `Peer: [${peerTimestamp}] ${e.data}\n`;
        }
      } catch (error) {
        chatBox.value += `Peer: [${peerTimestamp}] ${e.data}\n`;
      }
    } else {
      if (isReceivingSingleBlobFile) {
        receivedFile.push(e.data);
        receivedBytes = e.data.byteLength;
        const progress = (receivedBytes / receivedFileSize) * 100;
        progressBar.style.width = `${progress}%`;
        chatBox.value += `Peer: [${peerTimestamp}] Receiving file: ${receivedFileName} (Single Blob) ${progress.toFixed(2)}%\n`;
        console.log(`[Receiver] Received single blob of size: ${e.data.byteLength}`);
      } else {
        receivedFile.push(e.data);
        receivedBytes += e.data.byteLength;
        const progress = (receivedBytes / receivedFileSize) * 100;
        // Update progress bar and chatbox less frequently
        if (progress - parseFloat(progressBar.style.width) >= 1 || receivedBytes === receivedFileSize) {
          progressBar.style.width = `${progress}%`;
          chatBox.value += `Peer: [${peerTimestamp}] Receiving file chunk... ${progress.toFixed(2)}%\n`;
          console.log(`[Receiver] Received chunk of size: ${e.data.byteLength}, total received: ${receivedBytes}/${receivedFileSize}`);
        }
      }
    }
    chatBox.scrollTop = chatBox.scrollHeight; // Auto-scroll to bottom
  };
  
  dataChannel.onopen = () => {
    updateConnectionStatus('connected');
  };
  
  dataChannel.onclose = () => {
    updateConnectionStatus('disconnected');
  };
  
  dataChannel.onerror = () => {
    updateConnectionStatus('error');
  };
}

function sendMessage() {
  const messageInput = document.getElementById('message');
  const msg = messageInput.value;
  
  if (!msg.trim()) return;
  
  if (dataChannel && dataChannel.readyState === 'open') {
    dataChannel.send(msg);
    const youTimestamp = new Date().toLocaleString();
    chatBox.value += `You: [${youTimestamp}] ${msg}\n`;
    chatBox.scrollTop = chatBox.scrollHeight; // Auto-scroll to bottom
    messageInput.value = ''; // Clear input after sending
  } else {
    alert('Not connected to a peer. Please join a room first.');
  }
}

async function sendFile() {
  const file = fileInput.files[0];
  if (!file) {
    alert('Please select a file to send.');
    return;
  }

  if (!dataChannel || dataChannel.readyState !== 'open') {
    alert('Not connected to a peer. Please join a room first.');
    return;
  }

  chatBox.value += `You: Sending file: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)\n`;
  const fileStartMsg = JSON.stringify({
    type: 'file-start',
    name: file.name,
    size: file.size
  });
  dataChannel.send(fileStartMsg);
  console.log(`[Sender] Sent file-start: ${fileStartMsg}`);

  const MAX_FILE_SIZE_FOR_SINGLE_SEND = 100 * 1024 * 1024; // 100 MB

  if (file.size <= MAX_FILE_SIZE_FOR_SINGLE_SEND) {
    // Send as a single blob if file is small enough
    dataChannel.send(file);
    console.log(`[Sender] Sent file as single blob: ${file.name}, size: ${file.size}`);
    const progress = 100;
    progressBar.style.width = `${progress}%`;
  } else {
    // Use chunking for larger files
    let offset = 0;
    while (offset < file.size) {
      const slice = file.slice(offset, offset + CHUNK_SIZE);
      await new Promise(resolve => {
        if (dataChannel.bufferedAmount > dataChannel.bufferedAmountLowThreshold) {
          dataChannel.onbufferedamountlow = () => {
            dataChannel.onbufferedamountlow = null;
            resolve();
          };
        } else {
          resolve();
        }
      });
      dataChannel.send(slice);
      console.log(`[Sender] Sent chunk of size: ${slice.byteLength}, total sent: ${offset + slice.byteLength}/${file.size}`);
      offset += slice.byteLength;
      const progress = (offset / file.size) * 100;
      progressBar.style.width = `${progress}%`;
    }
  }

  const fileEndMsg = JSON.stringify({ type: 'file-end' });
  dataChannel.send(fileEndMsg);
  console.log(`[Sender] Sent file-end: ${fileEndMsg}`);
  chatBox.value += `You: File sent: ${file.name}\n`;
  progressBar.style.width = '0%';


}

function disconnect() {
  if (socket) {
    socket.close();
    console.log('WebSocket disconnected.');
    chatBox.value += "Disconnected from WebSocket.\n";
  }
  if (peer) {
    peer.close();
    console.log('WebRTC peer connection closed.');
    chatBox.value += "WebRTC peer connection closed.\n";
  }
  
  // Reset variables
  socket = null;
  peer = null;
  dataChannel = null;
  
  // Update UI to reflect disconnection
  chatBox.value += "You have disconnected.\n";
  chatBox.scrollTop = chatBox.scrollHeight;
  updateConnectionStatus('disconnected');
  alert("Disconnected from the room.");
  saveChatAsCsv();
}

function saveChatAsCsv() {
  const chatContent = chatBox.value;
  const lines = chatContent.split('\n').filter(line => line.trim() !== '');

  let csvContent = "Timestamp,Sender,Message\n"; // CSV header

  lines.forEach(line => {
    const timestampMatch = line.match(/\[(.*?)\]/);
    const timestamp = timestampMatch ? timestampMatch[1] : '';
    let sender = "";
    let message = "";

    if (line.startsWith('You: ')) {
      sender = "You";
      message = line.substring(line.indexOf(']') + 2).replace(/"/g, '""');
    } else if (line.startsWith('Peer: ')) {
      sender = "Peer";
      message = line.substring(line.indexOf(']') + 2).replace(/"/g, '""');
    } else if (line.startsWith('Disconnected from WebSocket.') || line.startsWith('WebRTC peer connection closed.') || line.startsWith('You have disconnected.')) {
      // Skip these system messages or handle them differently if needed
      return;
    } else {
      sender = "System";
      message = line.replace(/"/g, '""');
    }
    csvContent += `"${timestamp}","${sender}","${message}"\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) { // Feature detection
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'chat_session.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

// Update connection status indicator
function updateConnectionStatus(status) {
  // Remove all status classes
  statusIndicator.classList.remove('status-connected', 'status-disconnected', 'status-connecting', 'status-error');
  
  // Add appropriate class and update text
  switch(status) {
    case 'connected':
      statusIndicator.classList.add('status-connected');
      statusText.textContent = 'Connected';
      break;
    case 'connecting':
      statusIndicator.classList.add('status-connecting');
      statusText.textContent = 'Connecting...';
      break;
    case 'error':
      statusIndicator.classList.add('status-error');
      statusText.textContent = 'Connection Error';
      break;
    case 'disconnected':
    default:
      statusIndicator.classList.add('status-disconnected');
      statusText.textContent = 'Disconnected';
      break;
  }
}

// Add event listener for Enter key in message input
document.getElementById('message').addEventListener('keypress', function(e) {
  if (e.key === 'Enter') {
    sendMessage();
  }
});

// Add event listener for Enter key in room input
document.getElementById('room').addEventListener('keypress', function(e) {
  if (e.key === 'Enter') {
    joinRoom();
  }
});
