/**
 * APOD Email Preview Generator
 * 
 * This script generates an HTML preview of the APOD email for any given date.
 * Useful for testing email formatting before deployment.
 * 
 * Usage:
 *   1. Edit the TARGET_DATE constant below to your desired date
 *   2. Run: node preview_apod_email.js
 *   3. Open email_preview.html in a browser to view the result
 */

const { getDataByDate } = require('./src/services/apodScraper');
const fs = require('fs');

// ============================================
// CONFIGURATION: Edit this date to preview a different APOD
// Format: YYYY-MM-DD
// ============================================
const TARGET_DATE = '2026-01-13';

async function generateEmailPreview() {
    try {
        console.log(`Generating email preview for ${TARGET_DATE}...\n`);

        // Parse the date string
        const [year, month, day] = TARGET_DATE.split('-').map(Number);
        const date = new Date(year, month - 1, day);

        // Fetch data from APOD
        const data = await getDataByDate(date);

        console.log('✅ Scraped data:');
        console.log('   Title:', data.title);
        console.log('   Media Type:', data.media_type);
        console.log('   URL:', data.url);
        console.log('   Date:', data.date);
        console.log();

        // Generate HTML using same logic as apodService.js
        const title = `APOD - ${data.title}`;
        let mediaHtml = '';

        if (data.media_type === 'video') {
            const isYouTubeEmbed = data.url.includes('youtube.com/embed') || data.url.includes('youtu.be');
            const isVimeoEmbed = data.url.includes('vimeo.com');

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
                const dateStr = data.date.replace(/-/g, '').slice(2);
                const apodUrl = `https://apod.nasa.gov/apod/ap${dateStr}.html`;
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
        const outputFile = 'email_preview.html';
        fs.writeFileSync(outputFile, html);
        console.log(`\n✅ Email preview saved to ${outputFile}`);
        console.log(`   Open file://${process.cwd()}/${outputFile} to view\n`);

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

generateEmailPreview();
