const apodScraper = require('./apodScraper');

async function fetchAPOD() {
    try {
        const data = await apodScraper.getDataByDate(new Date());

        // Data structure:
        // {
        //   "title": "Moon Games",
        //   "explanation": "...",
        //   "date": "2025-11-29",
        //   "hdurl": "...",
        //   "url": "...",
        //   "media_type": "image",
        //   "copyright": "..."
        // }

        const title = `APOD - ${data.title}`;

        // Construct HTML manually
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
            // Detect video type: YouTube/Vimeo embed vs native HTML5 video
            const isYouTubeEmbed = data.url.includes('youtube.com/embed') || data.url.includes('youtu.be');
            const isVimeoEmbed = data.url.includes('vimeo.com');

            if (isYouTubeEmbed || isVimeoEmbed) {
                // Handle YouTube/Vimeo embeds (existing logic)
                const videoIdMatch = data.url.match(/embed\/(\S+)[?]/) || data.url.match(/embed\/([^?]+)/);
                let videoPreview = `<center><a href="${data.url}">${data.url}</a></center>`;

                if (videoIdMatch) {
                    const videoId = videoIdMatch[1];
                    const imgUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                    videoPreview += `
                        <br>
                        <center>
                            <a href="${data.url}">
                                <img src="${imgUrl}">
                            </a>
                        </center>
                     `;
                }
                mediaHtml = videoPreview;
            } else {
                // Handle native HTML5 video tags
                // Construct APOD URL from date (format: ap260113.html from 2026-01-13)
                const dateStr = data.date.replace(/-/g, '').slice(2); // "2026-01-13" -> "260113"
                const apodUrl = `https://apod.nasa.gov/apod/ap${dateStr}.html`;

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
                    <p> ${data.date} </p>
                    <b> ${data.title} </b> <br> 
                </center>
                
                ${mediaHtml}

                <center>
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
                        <i>This is an automated email. You can add and remove your email addresses from the distribution list here, <a href="https://apodemail.org">https://apodemail.org</a>.</i>
                    </i> or <a href="https://apodemail.org?action=unsubscribe&email={{email}}">unsubscribe here</a>
                </p>
            </body>
            </html>
        `;

        return {
            title: title,
            html: html
        };

    } catch (error) {
        console.error("Error fetching APOD from API:", error);
        throw error;
    }
}

module.exports = { fetchAPOD };
