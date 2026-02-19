const express = require('express');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const os = require('os');

const app = express();
app.use(express.json({ limit: '10mb' }));

// CONFIG
const TEMPLATE_DIR = path.join(__dirname, 'template');
const WEBHOOK_URL = 'https://beads.lyzooapp.co.in:8443/webhook/send-zip';

// ============================
// MAIN API
// ============================
app.post('/generate-site', async (req, res) => {
  let siteDir;

  try {
    let { html, img_url } = req.body;

    if (!html || !img_url) {
      return res.status(400).json({ message: 'html or img_url missing' });
    }

    // -------------------------
    // CLEAN HTML
    // -------------------------
    html = String(html)
      .replace(/\\n/g, '')
      .replace(/\\t/g, '')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .replace(/>\s+</g, '><')
      .replace(/\s{2,}/g, ' ')
      .trim();

    // -------------------------
    // TEMP DIRECTORY (AUTO)
    // -------------------------
    siteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'site-'));

    // copy template
    await fs.copy(TEMPLATE_DIR, siteDir);

    // -------------------------
    // CLEAN IMAGE FOLDER
    // -------------------------
    const imgDir = path.join(siteDir, 'assets', 'img');
    await fs.ensureDir(imgDir);

    const files = await fs.readdir(imgDir);

    for (const file of files) {
      if (file.match(/\.(jpg|jpeg|png|webp|avif)$/i)) {
        await fs.remove(path.join(imgDir, file));
      }
    }

    // -------------------------
    // DOWNLOAD IMAGE
    // -------------------------
    const imgPath = path.join(imgDir, 'static-image.jpg');

    const response = await axios({
      url: img_url,
      method: 'GET',
      responseType: 'stream',
    });

    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(imgPath);
      response.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    // -------------------------
    // FIX IMAGE PATHS
    // -------------------------
    html = html.replace(/assets\/img\/[^"]+/g, 'assets/img/static-image.jpg');

    // -------------------------
    // SAVE HTML
    // -------------------------
    await fs.writeFile(path.join(siteDir, 'index.html'), html, 'utf8');

    // -------------------------
    // CREATE ZIP (IN MEMORY)
    // -------------------------
    const archive = archiver('zip', { zlib: { level: 9 } });

    let chunks = [];

    archive.on('data', (chunk) => chunks.push(chunk));

    const zipPromise = new Promise((resolve, reject) => {
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);
    });

    archive.directory(siteDir, false);
    archive.finalize();

    const zipBuffer = await zipPromise;

    // -------------------------
    // SEND ZIP TO WEBHOOK
    // -------------------------
    await axios.post(WEBHOOK_URL, zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename=staticwebsite.zip',
      },
    });

    // -------------------------
    // RESPONSE
    // -------------------------
    res.json({
      message: 'Site generated and sent successfully',
      file: 'staticwebsite.zip',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: 'Error generating site',
      error: err.message,
    });
  } finally {
    // -------------------------
    // CLEANUP TEMP DIR
    // -------------------------
    if (siteDir) {
      await fs.remove(siteDir);
    }
  }
});

// ============================
// START SERVER
// ============================
app.listen(3000, () => {
  console.log('🚀 Server running on http://localhost:3000');
});
