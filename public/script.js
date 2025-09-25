let suppressCodeChange = false; //Infinite event emit loop glitch occuring without this
let suppressTextChange = false;
// ABLY for running the server 
let ably;
let channel;
let currentRoomId = null;

//Code for codespace highlighting
var editor = CodeMirror.fromTextArea(document.getElementById("codespace"), {
  lineNumbers: true,
  mode: "javascript",
  theme: "default",
});

//NEW FUNCTION for ABLY 
async function initializeAbly() {
  try {
    const response = await fetch('/api/get-key');
    if (!response.ok) {
        throw new Error('Failed to get API key from server.');
    }
    const { key } = await response.json();

    // Use the key to connect to Ably
    ably = new Ably.Realtime.Promise({ key: key, clientId: 'user-' + Math.random().toString(16).substr(2, 8) });
    console.log('Ably connection established!');

  } catch (error) {
    console.error('Error initializing Ably:', error);
    alert('Could not connect to the real-time service. Please try refreshing the page.');
  }
}

//Scratchpad area
var scratchpad = document.getElementById("scratchpad");

const connectButton = document.getElementById("connect-button");
const usernameInput = document.getElementById("username-input");

//Emits only if the change occurs locally, not remotely
editor.on("change", () => {
  if (suppressCodeChange || !channel) return; // Exit if no channel is active
  const code = editor.getValue();
  const username = usernameInput.value.trim();

  // Publish the code change to the channel
  channel.publish('code-update', { code: code });
  // Publish the typing event
  channel.publish('typing', { username: username });
});
//EMit on scratchpad change
scratchpad.addEventListener("input", () => {
  if (suppressTextChange || !channel) return; // Exit if no channel is active
  const scratchpadText = scratchpad.value;
  const username = usernameInput.value.trim();

  // Publish the scratchpad change to the channel
  channel.publish('scratchpad-update', { scratchpadText: scratchpadText });
  // Publish the typing event
  channel.publish('typing', { username: username });
});
console.log("script.js loaded successfully!");


// connectButton logic with ably
connectButton.addEventListener("click", async () => {
  const username = usernameInput.value.trim();
  const roomInput = document.getElementById("room-id-input");
  let room = roomInput.value.trim();

  if (!username) {
    alert("Please enter a username.");
    return;
  }

  // If the user didn't enter a room, generate a random 6-digit one
  if (!room) {
    room = Math.floor(100000 + Math.random() * 900000).toString();
  }

  currentRoomId = room;

  // "channel" is the new "room". This gets or creates the channel.
  channel = ably.channels.get(`collide-room:${currentRoomId}`);

  // We will create this function in the next step to handle incoming messages
  subscribeToChannelEvents();

  // Use Ably's "Presence" feature to announce that this user has joined
  await channel.presence.enter({ username: username });

  // --- This UI logic stays the same ---
  document.getElementById("room-id-display").innerText = currentRoomId;
  document.getElementById("room-info").style.display = "block";
  document.getElementById("connect-modal").style.display = "none";
});


// REPLACE the empty function with this complete one
function subscribeToChannelEvents() {

  // 1. Listen for code changes from other users
  channel.subscribe('code-update', (message) => {
    // You can reuse your old logic here!
    const newCode = message.data.code;
    const currentCursor = editor.getCursor();
    if (editor.getValue() === newCode) return;

    suppressCodeChange = true;
    editor.setValue(newCode);
    editor.setCursor(currentCursor);
    suppressCodeChange = false;
  });

  // 2. Listen for scratchpad changes from other users
  channel.subscribe('scratchpad-update', (message) => {
    // You can reuse your old logic here too!
    const newText = message.data.scratchpadText;
    const currentText = scratchpad.value;
    if (currentText === newText) return;
    const start = scratchpad.selectionStart;
    const end = scratchpad.selectionEnd;

    suppressTextChange = true;
    scratchpad.value = newText;
    scratchpad.setSelectionRange(start, end);
    suppressTextChange = false;
  });

  // 3. Use Ably's Presence feature to update the user list
  channel.presence.subscribe(['enter', 'leave', 'update'], () => {
    channel.presence.get((err, members) => {
      const users = members.map(m => m.data.username);

      // Your old user list update logic works perfectly here
      const userListElement = document.getElementById("user-list");
      userListElement.innerHTML = "";
      users.forEach(user => {
        const userTag = document.createElement("span");
        userTag.innerText = user;
        userTag.classList.add("user-tag");
        userListElement.appendChild(userTag);
      });
      document.getElementById("user-count").innerText = users.length;
    });
  });

  // (Optional) Listen for typing indicators
  channel.subscribe('typing', (message) => {
    // Ignore our own typing events
    if (message.clientId === ably.auth.clientId) {
        return;
    }
    const username = message.data.username;
    const typingIndicator = document.getElementById("typing-indicator");
    typingIndicator.innerText = `${username} is typing...`;
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      typingIndicator.innerText = "";
    }, 2000);
  });
}


// This block handles showing and hiding the typing indicator
let typingTimer;
const typingIndicator = document.getElementById("typing-indicator");



//NEED TO REFINE THIS. NOT 100% WORKING YET
// --- Upload and Download Logic ---

const downloadBtn = document.getElementById("download-btn");
const uploadBtn = document.getElementById("upload-btn");
const fileInput = document.getElementById("file-input");

// Download Logic
if (downloadBtn) {
  downloadBtn.addEventListener("click", () => {
    const code = editor.getValue();
    const blob = new Blob([code], { type: "text/javascript" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "code.js";
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

// Upload Logic
if (uploadBtn && fileInput) {
  uploadBtn.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const fileContent = e.target.result;
      suppressCodeChange = true;
      editor.setValue(fileContent);
      suppressCodeChange = false;
    };
    reader.readAsText(file);
    event.target.value = "";
  });
}

// Capture console.log and run user code
const runButton = document.getElementById("run-button");
const outputBox = document.getElementById("output");

function runJS(code) {
  const logs = [];
  const originalLog = console.log;

  // Override console.log
  console.log = (...args) => {
    logs.push(args.join(" "));
    originalLog.apply(console, args);
  };

  try {
    new Function(code)(); // safely execute code
  } catch (err) {
    logs.push("Error: " + err.message);
  }

  // Restore console.log
  console.log = originalLog;

  return logs.join("\n");
}

if (runButton) {
  runButton.addEventListener("click", () => {
    const code = editor.getValue();
    const output = runJS(code);
    outputBox.textContent = output;
  });
}

const outputPanel = document.getElementById("output-panel");
const dragHandle = document.getElementById("drag-handle");

let isDragging = false;
let startY = 0;
let startHeight = 0;

if (runButton) {
  runButton.addEventListener("click", () => {
    const code = editor.getValue();
    const output = runJS(code);
    outputBox.textContent = output;

    // Show panel at 30% of screen height if hidden
    if (outputPanel.classList.contains("hidden")) {
      outputPanel.classList.remove("hidden");
      outputPanel.style.height = window.innerHeight * 0.3 + "px";
    }
  });
}

// Drag to resize
dragHandle.addEventListener("mousedown", (e) => {
  isDragging = true;
  startY = e.clientY;
  startHeight = outputPanel.offsetHeight;
  document.body.style.userSelect = "none"; // prevent text highlight
});

window.addEventListener("mousemove", (e) => {
  if (!isDragging) return;

  const dy = startY - e.clientY;
  const newHeight = startHeight + dy;

  if (newHeight < 5) {
    outputPanel.classList.add("hidden");
  } else {
    outputPanel.style.height = newHeight + "px";
  }
});

window.addEventListener("mouseup", () => {
  isDragging = false;
  document.body.style.userSelect = "auto";
});

// --- New, Self-Contained Python Runner Logic ---

const pythonRunButton = document.getElementById("run-python-button");
let pyodideInstance = null;

// This function loads the Python interpreter in the background
async function loadPyodideInterpreter() {
  console.log("Starting to load Pyodide for the Python runner...");
  pythonRunButton.textContent = "Loading Python...";
  pythonRunButton.disabled = true;

  try {
    pyodideInstance = await loadPyodide();
    console.log("Pyodide loaded successfully!");
    pythonRunButton.innerHTML = "Run Python &#x25B6;";
    pythonRunButton.disabled = false;
  } catch (error) {
    console.error("Failed to load Pyodide:", error);
    pythonRunButton.textContent = "Python Failed";
  }
}

// This function runs the Python code using the loaded interpreter
async function runPythonCode(code, outputElement) {
  if (!pyodideInstance) {
    outputElement.textContent = "Pyodide is not ready yet.";
    return;
  }

  pythonRunButton.textContent = "Running...";
  pythonRunButton.disabled = true;

  try {
    // Redirect Python's standard output
    pyodideInstance.runPython(`
            import sys
            import io
            sys.stdout = io.StringIO()
        `);
    // Execute the user's code
    await pyodideInstance.runPythonAsync(code);
    // Get the captured output
    const stdout = pyodideInstance.runPython("sys.stdout.getvalue()");
    outputElement.textContent = stdout;
  } catch (error) {
    outputElement.textContent = `Python Error: ${error.message}`;
  }

  pythonRunButton.innerHTML = "Run Python &#x25B6;";
  pythonRunButton.disabled = false;
}

// Attach the event listener to the new button
if (pythonRunButton) {
  pythonRunButton.addEventListener("click", () => {
    const codeToRun = editor.getValue();
    const outputBox = document.getElementById("output");
    const outputPanel = document.getElementById("output-panel");

    // Show panel if it's hidden
    if (outputPanel.classList.contains("hidden")) {
      outputPanel.classList.remove("hidden");
      outputPanel.style.height = window.innerHeight * 0.3 + "px";
    }

    runPythonCode(codeToRun, outputBox);
  });
}

// Start loading the interpreter as soon as the script runs
loadPyodideInterpreter();

// MAKES SURE THAT THE CONNECTION FUN RUNS 
initializeAbly();