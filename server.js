const express = require('express');
const path = require('path');
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

    let browser;
    try {
        // Optimasi executable path khusus environment Vercel
        const executablePath = await chromium.executablePath();

        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: executablePath || '/usr/bin/chromium',
            headless: chromium.headless === 'new' ? true : chromium.headless,
        });

        const page = await browser.newPage();
        
        // Timeout 12 detik agar tidak melebihi limit Vercel Hobby (15s)
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });

        const scrapedData = await page.evaluate(() => {
            const findTextByKeywords = (keywords) => {
                const elements = Array.from(document.querySelectorAll('td, span, p, div, h1, h2, h3'));
                for (let el of elements) {
                    const text = el.innerText || '';
                    if (keywords.some(kw => text.toLowerCase().includes(kw.toLowerCase()))) {
                        return text.trim();
                    }
                }
                return '-';
            };

            const getAllImages = () => {
                const imgs = Array.from(document.querySelectorAll('img'));
                return imgs.map(img => img.src).filter(src => src && !src.includes('data:image/svg'));
            };

            const images = getAllImages();

            return {
                admin: {
                    noTransaksi: document.querySelector('#no_transaksi')?.innerText || findTextByKeywords(['No. Transaksi', 'No Transaksi', 'Nota']),
                    namaKios: document.querySelector('#nama_kios')?.innerText || findTextByKeywords(['Kios', 'Nama Kios']),
                    kodeKios: document.querySelector('#kode_kios')?.innerText || findTextByKeywords(['Kode Kios']),
                    namaPetani: document.querySelector('#nama_petani')?.innerText || findTextByKeywords(['Nama Petani', 'Petani']),
                    nikPetani: document.querySelector('#nik_petani')?.innerText || findTextByKeywords(['NIK']),
                },
                images: {
                    ktpPembeli: images[0] || '',
                    buktiPenyaluran: images[1] || '',
                    ktpPerwakilan: images[2] || null,
                    allImages: images
                }
            };
        });

        await browser.close();
        res.json({ success: true, ...scrapedData });

    } catch (error) {
        if (browser) await browser.close();
        console.error('Error Puppeteer:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal memproses nota', 
            errorDetails: error.toString() 
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
