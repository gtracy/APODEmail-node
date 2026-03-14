const apodScraper = require('./src/services/apodScraper');
const fs = require('fs');
const { DateTime } = require('luxon');

// Extract the logic from apodService.js to verify it
function getMediaHtml(data) {
    let mediaHtml = '';
    if (data.media_type === 'image') {
        mediaHtml = `
            <center>
                <a href="${data.hdurl || data.url}">
                    <img src="${data.url}" alt="${data.title}" style="max-width:100%">
                </a>
            </center>
        `;
    } else if (data.media_type === 'video') {
        let isYouTubeEmbed = false;
        let isVimeoEmbed = false;

        try {
            const urlObj = new URL(data.url);
            const hostname = urlObj.hostname;
            if (hostname === 'youtube.com' || hostname === 'www.youtube.com' || hostname === 'youtu.be') {
                isYouTubeEmbed = true;
            }
            if (hostname === 'vimeo.com' || hostname === 'www.vimeo.com' || hostname === 'player.vimeo.com') {
                isVimeoEmbed = true;
            }
        } catch (e) { }

        if (isYouTubeEmbed || isVimeoEmbed) {
            let videoId = '';
            let imgUrl = '';
            let videoLink = data.url;

            if (isYouTubeEmbed) {
                const ytMatch = data.url.match(/embed\/([^?#\s]+)/) || data.url.match(/v=([^&?#\s]+)/);
                if (ytMatch) {
                    videoId = ytMatch[1];
                    imgUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                }
            }
            // ... (rest of logic)
            if (imgUrl) {
                mediaHtml = `
                    <center>
                        <div style="position: relative; display: inline-block;">
                            <a href="${videoLink}" style="text-decoration: none;">
                                <img src="${imgUrl}" alt="Watch Video" style="max-width: 100%; border-radius: 8px; display: block;">
                                <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                                            background: rgba(0,0,0,0.6); border-radius: 50%; width: 60px; height: 60px; 
                                            display: flex; align-items: center; justify-content: center;">
                                    <span style="color: white; font-size: 30px; margin-left: 5px;">▶</span>
                                </div>
                            </a>
                        </div>
                        <p style="margin-top: 10px;">
                            <a href="${videoLink}" style="color: #667eea; text-decoration: none; font-weight: bold; font-family: Arial, sans-serif;">
                                🎬 Watch Video: ${data.title}
                            </a>
                        </p>
                    </center>
                `;
            }
        }
    }
    return mediaHtml;
}

async function test() {
    const date = new Date('2026-03-12T12:00:00Z');
    try {
        const data = await apodScraper.getDataByDate(date);
        console.log('Scraped Title:', data.title);
        const html = getMediaHtml(data);
        console.log('Generated Media HTML:', html);
        fs.writeFileSync('youtube_media_only.html', html);
    } catch (error) {
        console.error(error);
    }
}

test();
