/**
 * APOD Email Preview Generator
 * 
 * This script generates an HTML preview of the APOD email for:
 * 1. A fixed date known to have a video (2026-01-13) - for regression testing video handling.
 * 2. Today's date - to see the current APOD.
 * 
 * Usage:
 *   node preview_apod_email.js
 * 
 * Output:
 *   - email_preview_2026-01-13.html
 *   - email_preview_YYYY-MM-DD.html (today)
 */

const { getDataByDate } = require('./src/services/apodScraper');
const fs = require('fs');

async function runPreviews() {
    // 1. Fixed date (Video APOD)
    const fixedDate = '2026-01-13';

    // 2. Today's date
    const today = new Date();
    const todayStr = today.getFullYear() + '-' +
        String(today.getMonth() + 1).padStart(2, '0') + '-' +
        String(today.getDate()).padStart(2, '0');

    // Use a Set to avoid duplicates if today IS the fixed date
    const targetDates = new Set([fixedDate, todayStr]);

    console.log(`Starting preview generation for: ${Array.from(targetDates).join(', ')}`);

    for (const dateStr of targetDates) {
        await generateEmailPreview(dateStr);
    }
}

async function generateEmailPreview(dateStr) {
    try {
        console.log(`\n---------------------------------------------------------`);
        console.log(`Generating email preview for ${dateStr}...`);

        // Parse the date string
        const [year, month, day] = dateStr.split('-').map(Number);
        const date = new Date(year, month - 1, day);

        // Fetch data from APOD
        const data = await getDataByDate(date);

        console.log(`✅ Scraped data: ${data.title}`);

        // Generate HTML using same logic as apodService.js
        const title = `APOD - ${data.title}`;
        let mediaHtml = '';

        if (data.media_type === 'video') {
            let isYouTubeEmbed = false;
            let isVimeoEmbed = false;

            try {
                const urlObj = new URL(data.url);
                const hostname = urlObj.hostname;
                // Strict hostname check
                if (hostname === 'youtube.com' || hostname === 'www.youtube.com' || hostname === 'youtu.be') {
                    isYouTubeEmbed = true;
                }
                if (hostname === 'vimeo.com' || hostname === 'www.vimeo.com' || hostname === 'player.vimeo.com') {
                    isVimeoEmbed = true;
                }
            } catch (e) {
                console.error('Invalid URL:', data.url);
            }

            if (isYouTubeEmbed || isVimeoEmbed) {
                console.log('   Video Type: YouTube/Vimeo embed');
                const videoIdMatch = data.url.match(/embed\/(\S+)[?]/) || data.url.match(/embed\/([^?]+)/);
                let videoPreview = `<center><a href="${data.url}">${data.url}</a></center>`;
                if (videoIdMatch) {
                    const videoId = videoIdMatch[1];
                    const imgUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                    videoPreview += `<br><center><a href="${data.url}"><img src="${imgUrl}"></a></center>`;
                }
                mediaHtml = videoPreview;
            } else {
                console.log('   Video Type: Native HTML5 video');
                // Construct APOD format date: apYYMMDD.html
                const dateObj = new Date(dateStr); // re-parse to be safe or reuse parts
                // Note: new Date('2026-01-13') might be UTC depending on environment, but we parsed manually above.
                // Let's reuse the manual parse for safety for the file ID.
                const yy = String(year).slice(2);
                const mm = String(month).padStart(2, '0');
                const dd = String(day).padStart(2, '0');
                const apodUrl = `https://apod.nasa.gov/apod/ap${yy}${mm}${dd}.html`;
                console.log('   APOD URL:', apodUrl);

                mediaHtml = `
                    <center style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                                   padding: 30px 20px; 
                                   margin: 20px 0; 
                                   border-radius: 10px;">
                        <div style="font-size: 48px; margin-bottom: 10px;">🎬</div>
                        <h2 style="color: white; margin: 10px 0; font-size: 24px; font-family: Arial, sans-serif;">
                            Today's APOD is a Video!
                        </h2>
                        <p style="color: white; margin: 15px 0; font-size: 16px; line-height: 1.5; font-family: Arial, sans-serif;">
                            This feature includes video content that cannot be displayed in email.
                        </p>
                        <a href="${apodUrl}" 
                           style="display: inline-block; 
                                  background: white; 
                                  color: #667eea; 
                                  padding: 12px 30px; 
                                  text-decoration: none; 
                                  border-radius: 25px; 
                                  font-weight: bold; 
                                  font-family: Arial, sans-serif;
                                  margin-top: 10px;">
                            ► Watch Video on NASA APOD
                        </a>
                    </center>
                `;
            }
        } else if (data.media_type === 'image') {
            console.log('   Media Type: Image');
            mediaHtml = `
                <center>
                    <a href="${data.hdurl || data.url}">
                        <img src="${data.url}" alt="${data.title}" style="max-width:100%">
                    </a>
                </center>
            `;
        }

        const copyrightHtml = data.copyright ? `<b>Image Credit & Copyright:</b> ${data.copyright}` : '';

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>${title}</title>
            </head>
            <body bgcolor="#F4F4FF" text="#000000" link="#0000FF" vlink="#7F0F9F" alink="#FF0000">
                <center>
                    <h1> Astronomy Picture of the Day </h1>
                    <p>
                        <a href="https://apod.nasa.gov/apod/archivepix.html">Discover the cosmos!</a>
                        Each day a different image or photograph of our fascinating universe is featured, along with a brief explanation written by a professional astronomer.
                    </p>
                    <p>
                        ${data.date}
                    </p>
                </center>
                
                ${mediaHtml}

                <center>
                    <b> ${data.title} </b> <br> 
                    ${copyrightHtml}
                </center> 
                
                <p> 
                    <b> Explanation: </b> 
                    ${data.explanation}
                </p>
                
                <center>
                    <p>
                        <a href="https://apod.nasa.gov/apod/archivepix.html">Archive</a> | 
                        <a href="https://apod.nasa.gov/apod/lib/about_apod.html">About APOD</a>
                    </p>
                </center>

                <hr>
                <p>
                    <i>
                        <strong>This is an automated email. If you notice any problems, just send me a note at <a href="mailto:gtracy@gmail.com">gtracy@gmail.com</a>. 
                        You can add and remove email addresses to this distribution list here, <a href="https://apodemail.org">https://apodemail.org</a>.</strong>
                    </i>
                    <a href="https://apodemail.org?action=unsubscribe&email={{email}}">Unsubscribe</a>
                </p>
            </body>
            </html>
        `;

        // Save to file
        const outputFile = `email_preview_${dateStr}.html`;
        fs.writeFileSync(outputFile, html);
        console.log(`✅ Saved to ${outputFile}`);
        console.log(`   (file://${process.cwd()}/${outputFile})`);

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    }
}

runPreviews();
