const { spawn } = require('child_process');
const axios = require('axios');
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = express();
app.use(express.static('public'));

app.use('/whip', createProxyMiddleware({ target: 'http://127.0.0.1:9000', changeOrigin: true }));
app.use('/whep', createProxyMiddleware({ target: 'http://127.0.0.1:9000', changeOrigin: true }));

const PORT = 3000;

const SMELTER_BIN = '/home/radek/workspace/swm/smelter_linux_x86_64/smelter/smelter';
const SMELTER_API_URL = 'http://127.0.0.1:8081';

let smelterProcess = null;

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function startSmelter() {
    console.log('[Backend] Starting Smelter daemon...');
    smelterProcess = spawn(SMELTER_BIN, [], {
        stdio: 'inherit',
        env: process.env
    });

    smelterProcess.on('close', (code) => {
        console.log(`[Backend] Smelter exited with code ${code}`);
    });

    // Wait for smelter to be ready
    await delay(3000);
}

async function configureSmelter() {
    console.log('[Backend] Configuring inputs and outputs via Smelter API...');
    try {
        // Register WHIP Input
        await axios.post(`${SMELTER_API_URL}/api/input/phone_in/register`, {
            type: 'whip_server',
            bearer_token: 'smelter_token'
        });
        console.log('[Backend] Registered WHIP Input: phone_in');

        // Register WHEP Output 1
        await axios.post(`${SMELTER_API_URL}/api/output/endpoint_1/register`, {
            type: 'whep_server',
            bearer_token: 'smelter_token',
            video: {
                resolution: { width: 1280, height: 720 },
                encoder: { type: 'ffmpeg_h264' },
                initial: { root: { type: 'input_stream', input_id: 'phone_in' } }
            }
        });
        console.log('[Backend] Registered WHEP Output 1: endpoint_1');

        // Register WHEP Output 2
        await axios.post(`${SMELTER_API_URL}/api/output/endpoint_2/register`, {
            type: 'whep_server',
            bearer_token: 'smelter_token',
            video: {
                resolution: { width: 1280, height: 720 },
                encoder: { type: 'ffmpeg_h264' },
                initial: { root: { type: 'input_stream', input_id: 'phone_in' } }
            }
        });
        console.log('[Backend] Registered WHEP Output 2: endpoint_2');

        // Start Smelter pipeline
        await axios.post(`${SMELTER_API_URL}/api/start`, {});
        console.log('[Backend] Smelter pipeline started successfully!');

        console.log(`\n======================================================`);
        console.log(`📡 WEB STREAMING BACKEND IS READY!`);
        console.log(`======================================================`);
        console.log(`Open the dashboard on your devices to test:`);
        console.log(`🔗 http://127.0.0.1:3000/`);
        console.log(`🔗 http://<YOUR_LOCAL_IP>:3000/ (e.g. http://192.168.x.x:3000)`);
        console.log(`\nWhat you can do from the dashboard:`);
        console.log(`1. Broadcast Camera: Open the link on your phone to stream.`);
        console.log(`2. View Stream 1: Open the link on your laptop to watch.`);
        console.log(`3. View Stream 2: Open the link on another browser tab/device.`);
        console.log(`\nNote: For Android Chrome to allow camera on HTTP:`);
        console.log(`Go to chrome://flags/#unsafely-treat-insecure-origin-as-secure`);
        console.log(`and add http://<YOUR_LOCAL_IP>:3000`);
        console.log(`======================================================`);

    } catch (error) {
        console.error('[Backend] Failed to configure smelter:', error.response ? error.response.data : error.message);
    }
}

// Optional API for the backend to control the stream later
app.get('/status', (req, res) => {
    res.json({ status: 'running', message: 'Smelter orchestrator backend is active.' });
});

async function main() {
    await startSmelter();
    await configureSmelter();
    
    app.listen(PORT, () => {
        console.log(`[Backend] Express control server listing on http://localhost:${PORT}`);
    });
}

// Cleanup smelter process on exit
process.on('SIGINT', () => {
    if (smelterProcess) {
        console.log('Stopping smelter...');
        smelterProcess.kill('SIGINT');
    }
    process.exit();
});

main();
