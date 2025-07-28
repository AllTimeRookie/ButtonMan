// app.js

const roomInput = document.getElementById("room");
const chatBox = document.getElementById("chat");
const messageInput = document.getElementById("message");
const fileInput = document.getElementById("fileInput");

const socket = new WebSocket(location.origin.replace(/^http/, "ws"));
let peerConnection, dataChannel;
let roomId;
let chatHistory = []; // To store chat messages for CSV export

const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

function joinRoom() {
  roomId = roomInput.value.trim();
  if (!roomId) return alert("Room ID required");
  peerConnection = new RTCPeerConnection(config);

  peerConnection.onicecandidate = (e) => {
    if (e.candidate) {
      socket.send(JSON.stringify({ type: "ice", room: roomId, payload: { type: "ice", candidate: e.candidate } }));
    }
  };

  peerConnection.ondatachannel = (e) => {
    dataChannel = e.channel;
    setupDataChannel();
  };

  dataChannel = peerConnection.createDataChannel("chat");
  setupDataChannel();

  peerConnection.createOffer().then(offer => {
    peerConnection.setLocalDescription(offer);
    socket.send(JSON.stringify({ type: "offer", room: roomId, payload: { type: "offer", sdp: offer } }));
  });

  setStatus(true);
}

socket.onmessage = (msg) => {
  const payload = JSON.parse(msg.data);
  if (!peerConnection) return;
  if (payload.type === "offer") {
    peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp)).then(() => {
      peerConnection.createAnswer().then(answer => {
        peerConnection.setLocalDescription(answer);
        socket.send(JSON.stringify({ type: "answer", room: roomId, payload: { type: "answer", sdp: answer } }));
      });
    });
  } else if (payload.type === "answer") {
    peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
  } else if (payload.type === "ice") {
    peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
  }
};

function setupDataChannel() {
  dataChannel.onopen = () => console.log("Data channel open");
  dataChannel.onmessage = handleMessage;
  dataChannel.binaryType = "arraybuffer";
  dataChannel.bufferedAmountLowThreshold = 1024 * 1024; // 1 MB
  dataChannel.onbufferedamountlow = () => {
    if (currentFile && fileOffset < currentFile.size) {
      // If a file is being sent and there's more data, resume reading
      readSlice(fileOffset);
    }
  };
}

function sendMessage() {
  const msg = messageInput.value;
  if (msg && dataChannel?.readyState === "open") {
    dataChannel.send(JSON.stringify({ type: "text", message: msg }));
    const timestamp = new Date().toLocaleString();
    chatHistory.push({ type: "You", timestamp: timestamp, message: msg });
    chatBox.value += `You: ${msg}\n`;
    messageInput.value = "";
  }
}

function disconnect() {
  if (dataChannel) dataChannel.close();
  if (peerConnection) peerConnection.close();
  setStatus(false);
  saveChatAsCsv(); // Save chat history on disconnect
}

function saveChatAsCsv() {
  if (chatHistory.length === 0) {
    console.log("No chat history to save.");
    return;
  }

  let csvContent = "Type,Timestamp,Message\n"; // CSV header
  chatHistory.forEach(entry => {
    const message = entry.message.replace(/"/g, '""'); // Escape double quotes
    csvContent += `${entry.type},"${entry.timestamp}","${message}"\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const now = new Date();
  const filename = `chat_session_${roomId}.csv`;

  const link = document.createElement("a");
  if (link.download !== undefined) { // Feature detection for download attribute
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    console.log(`Chat history saved as ${filename}`);
  } else {
    alert("Your browser does not support downloading files directly. Please copy the chat history manually.");
  }
}

function setStatus(connected) {
  document.getElementById("status-indicator").className = connected ? "status-indicator status-connected" : "status-indicator status-disconnected";
  document.getElementById("status-text").innerText = connected ? "Connected" : "Disconnected";
}

// File Transfer
let incomingFile = [], incomingFileSize = 0, incomingFileName = "", receivedBytes = 0;

let currentFileProgressLine = '';

function handleMessage(event) {
  if (typeof event.data === "string") {
    const msg = JSON.parse(event.data);
    const timestamp = new Date().toLocaleString();
    if (msg.type === "text") {
      chatHistory.push({ type: "Peer", timestamp: timestamp, message: msg.message });
      chatBox.value += `Peer: ${msg.message}\n`;
    } else if (msg.type === "file-start") {
      incomingFile = [];
      incomingFileSize = msg.size;
      incomingFileName = msg.name;
      receivedBytes = 0;
      currentFileProgressLine = `Receiving file: ${incomingFileName} (0%)\n`;
      chatBox.value += currentFileProgressLine;
    } else if (msg.type === "file-end") {
      const blob = new Blob(incomingFile);
      const file = new File([blob], incomingFileName);
      receiveFile(file);
      chatBox.value = chatBox.value.replace(currentFileProgressLine, `File saved: ${incomingFileName}\n`);
      currentFileProgressLine = '';
    }
  } else {
    incomingFile.push(event.data);
    receivedBytes += event.data.byteLength;
    const percentage = ((receivedBytes / incomingFileSize) * 100).toFixed(0);
    const newProgressLine = `Receiving file: ${incomingFileName} (${percentage}%)\n`;
    chatBox.value = chatBox.value.replace(currentFileProgressLine, newProgressLine);
    currentFileProgressLine = newProgressLine;
  }
}

function receiveFile(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(url);
}

let fileReader;
let fileOffset = 0;
let currentFile;

function drainDataChannel() {
  if (dataChannel.bufferedAmount === 0) {
    dataChannel.send(JSON.stringify({ type: "file-end" }));
    console.log("Sent file-end message.");
    chatBox.value = chatBox.value.replace(currentSendProgressLine, `File sent: ${currentFile.name}\n`);
    currentSendProgressLine = '';
  } else {
    setTimeout(drainDataChannel, 50);
  }
}

let currentSendProgressLine = '';

function sendFile() {
  currentFile = fileInput.files[0];
  if (!currentFile || dataChannel?.readyState !== "open") return;

  fileReader = new FileReader();
  fileOffset = 0;

  dataChannel.send(JSON.stringify({ type: "file-start", name: currentFile.name, size: currentFile.size }));

  currentSendProgressLine = `Sending file: ${currentFile.name} (0%)\n`;
  chatBox.value += currentSendProgressLine;

  fileReader.onload = (e) => {
    if (dataChannel.bufferedAmount > dataChannel.bufferedAmountLowThreshold) {
      // Pause sending if buffer is full
      console.log("Buffer full, pausing send.");
      return;
    }
    dataChannel.send(e.target.result);
    fileOffset += e.target.result.byteLength;

    const percentage = ((fileOffset / currentFile.size) * 100).toFixed(0);
    const newProgressLine = `Sending file: ${currentFile.name} (${percentage}%)\n`;
    chatBox.value = chatBox.value.replace(currentSendProgressLine, newProgressLine);
    currentSendProgressLine = newProgressLine;

    if (fileOffset < currentFile.size) {
      readSlice(fileOffset);
    } else {
      // All data sent, now wait for buffer to drain before sending file-end
      drainDataChannel();
    }
  };

  readSlice(0);
}

function readSlice(o) {
  const CHUNK_SIZE = 64 * 1024;
  const slice = currentFile.slice(o, o + CHUNK_SIZE);
  fileReader.readAsArrayBuffer(slice);
}

function drainDataChannel() {
  if (dataChannel.bufferedAmount === 0) {
    dataChannel.send(JSON.stringify({ type: "file-end" }));
    console.log("File-end message sent.");
  } else {
    console.log(`Waiting for buffer to drain: ${dataChannel.bufferedAmount} bytes remaining.`);
    setTimeout(drainDataChannel, 100); // Check again after a short delay
  }
}
