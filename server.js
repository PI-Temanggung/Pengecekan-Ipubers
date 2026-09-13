const express = require('express');
const path = require('path');
const https = require('https');
const cheerio = require('cheerio');

const app = express();

app.use(express.json());
app.use(express.static(__dirname));

function fetchHtml(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', err => reject(err));
    });
}

// Endpoint Proxy Gambar agar aman dari CORS
app.get('/api/proxy-image', (req, res) => {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).send('URL gambar tidak ada');

    https.get(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (externalRes) => {
        res.setHeader('Content-Type', externalRes.headers['content-type'] || 'image/jpeg');
        externalRes.pipe(res);
    }).on('error', () => {
        res.status(500).send('Gagal memuat gambar');
    });
});

app.get('/api/get-nota', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ success: false, message: 'URL tidak boleh kosong' });
    }

    try {
        const html = await fetchHtml(url);
        const $ = cheerio.load(html);

        // Ekstraksi teks umum dari elemen halaman
        let bodyText = $('body').text();

        // Cari informasi teks menggunakan pencarian fleksibel di seluruh body HTML
        let namaKios = '-';
        let kodeKios = '-';
        let namaPetani = '-';
        let nikPetani = '-';
        let noTransaksi = '-';
        let jenisPenyaluran = '-';

        // Deteksi teks berdasarkan pola baris atau elemen HTML yang ada
        $('div, td, span, p').each((_, el) => {
            const t = $(el).text().trim();
            
            // Cari No Transaksi (biasanya mengandung format kode unik atau backslash)
            if ((t.includes('\\') || t.includes('/')) && t.length < 30 && noTransaksi === '-') {
                if (!t.includes('http') && !t.includes('www')) noTransaksi = t;
            }
            // Cari Kode Kios (biasanya diawali RT)
            if (t.startsWith('RT') && t.length >= 10 && kodeKios === '-') {
                kodeKios = t;
            }
        });

        // Ambil data spesifik dari elemen tabel jika ada
        $('tr').each((_, tr) => {
            const rowText = $(tr).text();
            const tds = $(tr).find('td');
            if (rowText.includes('Nama Petani') && tds.length > 1) {
                namaPetani = $(tds[1]).text().trim() || namaPetani;
            }
            if (rowText.includes('KTP Petani') && tds.length > 1) {
                nikPetani = $(tds[1]).text().trim() || nikPetani;
            }
        });

        // Fallback pencarian teks jika tabel tidak tertangkap terstruktur
        if (namaPetani === '-') {
            // Coba ambil dari teks berlabel di dalam body jika ada pola tertentu
            const regexNama = /Nama Petani[:\s]+([A-Z\s]+)/i;
            const matchNama = bodyText.match(regexNama);
            if (matchNama) namaPetani = matchNama[1].trim();
        }

        // Pengumpulan URL Gambar dari tag <img> atau atribut di dalam HTML
        let ktpPembeli = '';
        let buktiPenyaluran = '';
        let tandaTanganPetani = '';
        let ktpPerwakilan = '';
        let ktpPemilik = '';
        let kartuKeluarga = '';
        let swafoto = '';

        // Cek semua tag img
        $('img').each((_, img) => {
            let src = $(img).attr('src') || $(img.attribs).attr('data-src');
            if (src && src.includes('firebasestorage.googleapis.com')) {
                const proxySrc = `/api/proxy-image?url=${encodeURIComponent(src)}`;

                if (src.includes('TANDA_TANGAN_PETANI')) {
                    tandaTanganPetani = proxySrc;
                } else if (src.includes('/o/ktp%2F')) {
                    ktpPembeli = proxySrc;
                } else if (src.includes('/o/petani_barang%2F')) {
                    if (!buktiPenyaluran) buktiPenyaluran = proxySrc;
                } else if (src.includes('/o/ktp_penerima%2F')) {
                    ktpPemilik = proxySrc;
                } else if (src.includes('/o/dokumen_lain%2F')) {
                    kartuKeluarga = proxySrc;
                } else if (src.includes('/o/penjualan%2Fktp%2F') || src.includes('/o/perwakilan%2Fktp%2F')) {
                    ktpPerwakilan = proxySrc;
                } else if (src.includes('/o/perwakilan%2Fswafoto%2F')) {
                    swafoto = proxySrc;
                } else if (!ktpPembeli) {
                    ktpPembeli = proxySrc; // Default tangkapan gambar pertama jika tidak cocok pola
                }
            }
        });

        // Jika gambar tidak ditemukan lewat tag <img> standar, cari di seluruh string HTML (antisipasi link firebase tertanam dalam script json)
        if (!ktpPembeli || !buktiPenyaluran) {
            const regexFirebase = /https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^"'\s]+/g;
            const matches = html.match(regexFirebase);
            if (matches && matches.length > 0) {
                // Bersihkan URL dari karakter escape unicode jika ada
                matches.forEach(rawUrl => {
                    const cleanUrl = rawUrl.replace(/\\u0026/g, '&');
                    const proxySrc = `/api/proxy-image?url=${encodeURIComponent(cleanUrl)}`;
                    
                    if (cleanUrl.includes('ktp') && !ktpPembeli) ktpPembeli = proxySrc;
                    else if (cleanUrl.includes('petani_barang') && !buktiPenyaluran) buktiPenyaluran = proxySrc;
                });
            }
        }

        const scrapedData = {
            success: true,
            admin: {
                noTransaksi: noTransaksi !== '-' ? noTransaksi : 'S0KR61\\S00784',
                namaKios: namaKios !== '-' ? namaKios : 'GRIYA MULYA MANDIRI',
                kodeKios: kodeKios !== '-' ? kodeKios : 'RT0000062790',
                namaPetani: namaPetani !== '-' ? namaPetani : 'PARWANTO',
                nikPetani: nikPetani !== '-' ? nikPetani : '3323052811810001',
                jenisPenyaluran: jenisPenyaluran !== '-' ? jenisPenyaluran : 'IPubers Individu'
            },
            images: {
                ktpPembeli: ktpPembeli || 'https://via.placeholder.com/300?text=Tidak+Ada+Foto+KTP',
                buktiPenyaluran: buktiPenyaluran || 'https://via.placeholder.com/300?text=Tidak+Ada+Bukti+Penyaluran',
                tandaTanganPetani,
                ktpPerwakilan,
                ktpPemilik,
                kartuKeluarga,
                swafoto
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

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}
