const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Servis file statis dari folder public
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// API Endpoint untuk mengambil data nota via Puppeteer
app.get('/api/get-nota', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ success: false, message: 'URL tidak boleh kosong' });
    }

    let browser;
    try {
        // Inisialisasi Puppeteer dengan opsi argumen yang aman untuk Cloud Deploy (Render/Heroku/Vercel)
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process',
                '--no-zygote'
            ]
        });

        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        // Evaluasi data dari halaman target (sesuaikan selector jika diperlukan)
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

// Fallback route ke index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server Web App berjalan di port http://localhost:${PORT}`);
});