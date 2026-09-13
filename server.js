const express = require('express');
const path = require('path');
const https = require('https');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();

app.use(express.json());
app.use(express.static(__dirname));

// Helper untuk fetch HTML secara cepat tanpa browser penuh
function fetchHtmlDirect(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', err => reject(err));
    });
}

app.get('/api/get-nota', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ success: false, message: 'URL tidak boleh kosong' });
    }

    // 1. Coba ambil data langsung secara kilat (Direct HTTP Request)
    try {
        const html = await fetchHtmlDirect(url);
        if (html && html.length > 500) {
            // Regex parsing sederhana untuk data nota
            const extractText = (regex) => {
                const match = html.match(regex);
                return match ? match[1].trim() : '-';
            };

            const noTransaksi = extractText(/No\.?\s*Transaksi[^:]*:?<\/td>\s*<td[^>]*>(.*?)<\/td>/i) || '-';
            const namaPetani = extractText(/Nama\s*Petani[^:]*:?<\/td>\s*<td[^>]*>(.*?)<\/td>/i) || '-';

            // Jika berhasil mengekstrak data dari HTML murni
            if (noTransaksi !== '-' || namaPetani !== '-') {
                return res.json({
                    success: true,
                    admin: {
                        noTransaksi: noTransaksi,
                        namaKios: extractText(/Nama\s*Kios[^:]*:?<\/td>\s*<td[^>]*>(.*?)<\/td>/i),
                        kodeKios: extractText(/Kode\s*Kios[^:]*:?<\/td>\s*<td[^>]*>(.*?)<\/td>/i),
                        namaPetani: namaPetani,
                        nikPetani: extractText(/NIK[^:]*:?<\/td>\s*<td[^>]*>(.*?)<\/td>/i),
                    },
                    images: { ktpPembeli: '', buktiPenyaluran: '' }
                });
            }
        }
    } catch (e) {
        console.log('Direct fetch gagal, mencoba Puppeteer...');
    }

    // 2. Fallback ke Puppeteer jika halaman butuh render JS
    let browser;
    try {
        chromium.setGraphicsMode = false;
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: true,
        });

        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });

        const scrapedData = await page.evaluate(() => {
            const getText = (kw) => {
                const el = Array.from(document.querySelectorAll('td, span, div')).find(e => e.innerText.includes(kw));
                return el ? el.nextElementSibling?.innerText || el.innerText : '-';
            };
            return {
                admin: {
                    noTransaksi: getText('No. Transaksi'),
                    namaKios: getText('Nama Kios'),
                    kodeKios: getText('Kode Kios'),
                    namaPetani: getText('Nama Petani'),
                    nikPetani: getText('NIK'),
                },
                images: { ktpPembeli: '', buktiPenyaluran: '' }
            };
        });

        await browser.close();
        return res.json({ success: true, ...scrapedData });

    } catch (error) {
        if (browser) await browser.close();
        console.error('Puppeteer error:', error);
        return res.status(500).json({
            success: false,
            message: 'Gagal mengambil data dari link',
            errorDetails: error.message
        });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

module.exports = app;
