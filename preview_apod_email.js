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
const path = require('path');

const PREVIEW_DIR = path.join(__dirname, 'preview-tests');

// Create preview directory if it doesn't exist
if (!fs.existsSync(PREVIEW_DIR)) {
    fs.mkdirSync(PREVIEW_DIR, { recursive: true });
}

async function runPreviews() {
    // Mapping of dates to descriptive filenames
    const previews = [
        { date: '2026-01-13', name: 'video-tag' },
        { date: '2013-11-30', name: 'vimeo' },
        { date: '2022-12-04', name: 'youtube' },
        { date: '2022-01-13', name: 'static-image' }
    ];

    // Add today
    const today = new Date();
    const todayStr = today.getFullYear() + '-' +
        String(today.getMonth() + 1).padStart(2, '0') + '-' +
        String(today.getDate()).padStart(2, '0');
    
    previews.push({ date: todayStr, name: 'today' });

    console.log(`Starting preview generation in ${PREVIEW_DIR}`);

    for (const preview of previews) {
        await generateEmailPreview(preview.date, preview.name);
    }
}

async function generateEmailPreview(dateStr, fileName) {
    try {
        console.log(`\n---------------------------------------------------------`);
        console.log(`Generating preview for ${dateStr} as ${fileName}.html...`);

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
                
                if (isYouTubeEmbed) {
                    console.log('   -> Using YouTube Mock Player for local/email compatibility');
                    const videoIdMatch = data.url.match(/embed\/([^/?#]+)/);
                    const videoId = videoIdMatch ? videoIdMatch[1] : '';
                    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
                    
                    mediaHtml = `
                        <center>
                            <div style="max-width: 640px; margin: 20px auto; position: relative; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                                <a href="${data.url}" style="text-decoration: none; display: block; position: relative;">
                                    <img src="${thumbnailUrl}" style="width: 100%; display: block;" onerror="this.src='https://img.youtube.com/vi/${videoId}/hqdefault.jpg'">
                                    <!-- Play Button Overlay -->
                                    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                                                width: 80px; height: 80px; background: rgba(0,0,0,0.6); border-radius: 50%; 
                                                display: flex; align-items: center; justify-content: center; border: 4px solid white;">
                                        <div style="width: 0; height: 0; border-top: 20px solid transparent; border-bottom: 20px solid transparent; 
                                                    border-left: 30px solid white; margin-left: 8px;"></div>
                                    </div>
                                </a>
                            </div>
                            <p style="font-family: Arial, sans-serif; font-size: 14px; color: #666;">
                                <a href="${data.url}" style="color: #667eea; text-decoration: none; font-weight: bold;">Watch Video on YouTube</a>
                            </p>
                        </center>
                    `;
                } else {
                    console.log('   -> Using Vimeo Iframe');
                    mediaHtml = `
                        <center>
                            <div style="max-width: 640px; margin: 20px auto;">
                                <iframe width="100%" height="360" src="${data.url}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);"></iframe>
                            </div>
                            <p style="font-family: Arial, sans-serif; font-size: 14px; color: #666;">
                                Can't see the video? <a href="${data.url}" style="color: #667eea; text-decoration: none; font-weight: bold;">Watch it directly on Vimeo</a>
                            </p>
                        </center>
                    `;
                }
            } else {
                console.log('   Video Type: Native HTML5 video');
                // Construct APOD format date: apYYMMDD.html
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
        const outputFile = path.join(PREVIEW_DIR, `${fileName}.html`);
        fs.writeFileSync(outputFile, html);
        console.log(`✅ Saved to ${outputFile}`);
        console.log(`   (file://${outputFile})`);

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    }
}

runPreviews();
