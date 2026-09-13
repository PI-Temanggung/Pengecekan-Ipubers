const express = require('express');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();

app.use(express.json());
app.use(express.static(__dirname));

app.get('/api/get-nota', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ success: false, message: 'URL tidak boleh kosong' });
    }

    // --- METODE 1: HTTP Request + Cheerio Parser (Fast & Reliable) ---
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
            },
            timeout: 8000
        });

        const $ = cheerio.load(response.data);

        // Fungsi pembantu untuk mencari teks berdasarkan elemen HTML atau kata kunci
        const getText = (selector, keywords = []) => {
            if (selector && $(selector).length > 0) {
                return $(selector).text().trim();
            }
            for (let kw of keywords) {
                let foundText = '';
                $('td, span, div, p').each((_, el) => {
                    const text = $(el).text().trim();
                    if (text.toLowerCase().includes(kw.toLowerCase())) {
                        foundText = $(el).next().text().trim() || text;
                        return false; // Break loop
                    }
                });
                if (foundText) return foundText;
            }
            return '-';
        };

        const images = [];
        $('img').each((_, img) => {
            const src = $(img).attr('src');
            if (src && !src.includes('data:image/svg')) {
                images.push(src.startsWith('http') ? src : new URL(src, url).href);
            }
        });

        const resultData = {
            admin: {
                noTransaksi: $('#no_transaksi').text().trim() || getText(null, ['No. Transaksi', 'No Transaksi', 'Nota']),
                namaKios: $('#nama_kios').text().trim() || getText(null, ['Nama Kios', 'Kios']),
                kodeKios: $('#kode_kios').text().trim() || getText(null, ['Kode Kios']),
                namaPetani: $('#nama_petani').text().trim() || getText(null, ['Nama Petani', 'Petani']),
                nikPetani: $('#nik_petani').text().trim() || getText(null, ['NIK']),
            },
            images: {
                ktpPembeli: images[0] || '',
                buktiPenyaluran: images[1] || '',
                ktpPerwakilan: images[2] || null,
                allImages: images
            }
        };

        // Jika berhasil mengambil setidaknya satu bidang data utama
        if (resultData.admin.noTransaksi !== '-' || resultData.admin.namaPetani !== '-' || images.length > 0) {
            return res.json({ success: true, method: 'http', ...resultData });
        }
    } catch (httpError) {
        console.log('Metode HTTP gagal, beralih ke Puppeteer:', httpError.message);
    }

    // --- METODE 2: Puppeteer Browser Fallback ---
    let browser;
    try {
        browser = await puppeteer.launch({
            args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });

        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });

        const scrapedData = await page.evaluate(() => {
            const getText = (kw) => {
                const el = Array.from(document.querySelectorAll('td, span, div')).find(e => e.innerText.includes(kw));
                return el ? el.nextElementSibling?.innerText.trim() || el.innerText.trim() : '-';
            };
            const imgs = Array.from(document.querySelectorAll('img')).map(i => i.src);
            return {
                admin: {
                    noTransaksi: getText('No. Transaksi'),
                    namaKios: getText('Nama Kios'),
                    kodeKios: getText('Kode Kios'),
                    namaPetani: getText('Nama Petani'),
                    nikPetani: getText('NIK'),
                },
                images: {
                    ktpPembeli: imgs[0] || '',
                    buktiPenyaluran: imgs[1] || '',
                    allImages: imgs
                }
            };
        });

        await browser.close();
        return res.json({ success: true, method: 'puppeteer', ...scrapedData });

    } catch (puppeteerError) {
        if (browser) await browser.close();
        console.error('Puppeteer Fallback Error:', puppeteerError);
        return res.status(500).json({
            success: false,
            message: 'Gagal mengambil data dari link',
            errorDetails: puppeteerError.message
        });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}
