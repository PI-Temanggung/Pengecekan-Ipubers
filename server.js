const express = require('express');
const path = require('path');
const https = require('https');

const app = express();

app.use(express.json());
app.use(express.static(__dirname));

// Fungsi pembantu untuk mengambil HTML target secara native
function fetchHtml(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
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

    try {
        const html = await fetchHtml(url);

        // Ekstraksi teks sederhana menggunakan regex dari HTML murni iPubers
        const extractBetween = (startStr, endStr) => {
            try {
                const startIndex = html.indexOf(startStr);
                if (startIndex === -1) return '-';
                const subStr = html.substring(startIndex + startStr.length);
                const endIndex = subStr.indexOf(endStr);
                return endIndex !== -1 ? subStr.substring(0, endIndex).replace(/<[^>]*>?/gm, '').trim() : '-';
            } catch (e) {
                return '-';
            }
        };

        // Mengambil link gambar yang ada di halaman nota
        const images = [];
        const imgRegex = /<img[^>]+src="([^">]+)"/g;
        let match;
        while ((match = imgRegex.exec(html)) !== null) {
            let imgSrc = match[1];
            if (!imgSrc.includes('svg') && !imgSrc.includes('logo')) {
                images.push(imgSrc.startsWith('http') ? imgSrc : new URL(imgSrc, url).href);
            }
        }

        const scrapedData = {
            success: true,
            admin: {
                noTransaksi: extractBetween('id="no_transaksi">', '</td>') !== '-' ? extractBetween('id="no_transaksi">', '</td>') : 'Terdeteksi (Nota Valid)',
                namaKios: extractBetween('id="nama_kios">', '</td>'),
                kodeKios: extractBetween('id="kode_kios">', '</td>'),
                namaPetani: extractBetween('id="nama_petani">', '</td>'),
                nikPetani: extractBetween('id="nik_petani">', '</td>'),
            },
            images: {
                ktpPembeli: images[0] || '',
                buktiPenyaluran: images[1] || '',
                allImages: images
            }
        };

        return res.json(scrapedData);

    } catch (error) {
        console.error('Error:', error.message);
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

// Wajib agar Vercel membaca router Express dengan benar
module.exports = app;

if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}
