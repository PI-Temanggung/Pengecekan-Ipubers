const express = require('express');
const path = require('path');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();

// 1. Middleware dasar
app.use(express.json());

// 2. Servis file statis langsung dari root folder (tempat index.html & manifest.json berada)
app.use(express.static(__dirname));

// 3. API Endpoint untuk scraping nota iPubers
app.get('/api/get-nota', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ success: false, message: 'URL tidak boleh kosong' });
    }

    let browser;
    try {
        // Konfigurasi Puppeteer Core + Chromium Serverless khusus Vercel
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });

        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        // Scrape data dari elemen halaman web target
        const scrapedData = await page.evaluate(() => {
            const getText = (selector) => {
                const el = document.querySelector(selector);
                return el ? el.innerText.trim() : '-';
            };

            const getSrc = (selector) => {
                const el = document.querySelector(selector);
                return el ? el.src : '';
            };

            return {
                admin: {
                    noTransaksi: getText('#no_transaksi') || getText('.no-transaksi') || '-',
                    namaKios: getText('#nama_kios') || getText('.nama-kios') || '-',
                    kodeKios: getText('#kode_kios') || getText('.kode-kios') || '-',
                    namaPetani: getText('#nama_petani') || getText('.nama-petani') || '-',
                    nikPetani: getText('#nik_petani') || getText('.nik-petani') || '-',
                    namaPerwakilan: getText('#nama_perwakilan') || null,
                    nikPerwakilan: getText('#nik_perwakilan') || null
                },
                images: {
                    ktpPembeli: getSrc('#img_ktp_pembeli') || getSrc('.ktp-pembeli img'),
                    buktiPenyaluran: getSrc('#img_bukti_penyaluran') || getSrc('.bukti-penyaluran img'),
                    ktpPerwakilan: getSrc('#img_ktp_perwakilan') || null,
                    suratKuasaPdf: getSrc('#pdf_surat_kuasa') || null,
                    dokLain: []
                }
            };
        });

        await browser.close();
        res.json({ success: true, ...scrapedData });

    } catch (error) {
        if (browser) await browser.close();
        console.error('Error scraping:', error);
        res.status(500).json({ success: false, message: 'Gagal memproses nota', error: error.message });
    }
});

// 4. Fallback Routing: Arahkan semua akses halaman web ke index.html di root
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 5. Export app untuk Vercel Serverless Function
module.exports = app;

// 6. Mode lokal (Server biasa saat dijalankan di komputer sendiri)
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server berjalan di http://localhost:${PORT}`));
}
