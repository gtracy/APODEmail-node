import logging
from flask import Flask, request
from google.appengine.api import mail
from google.appengine.api import wrap_wsgi_app

app = Flask(__name__)

# Enable App Engine bundled services (via our local shim)
app.wsgi_app = wrap_wsgi_app(app.wsgi_app)

@app.route('/emailqueue', methods=['POST'])
def email_queue():
    try:
        email = request.form.get('email')
        body = request.form.get('body')
        subject = request.form.get('subject')
        bcc = request.form.get('bcc')

        # send email using Legacy API Interface (Shimmed)
        apod_message = mail.EmailMessage()
        apod_message.subject = subject
        apod_message.sender = 'gtracy@gmail.com'
        apod_message.html = body
        apod_message.to = email
        
        # Handle BCC if requested (legacy logic)
        if subject and subject.find('APOD Email') > -1 and bcc == 'True':
            apod_message.bcc = 'gtracy@gmail.com'

        apod_message.send()
        logging.info("Sent email to: %s" % email)
        return "Email sent", 200

    except Exception as e:
        logging.error("Error sending email to %s: %s" % (request.form.get('email'), str(e)))
        return "Error sending email", 500

if __name__ == '__main__':
    import os
    debug_mode = os.environ.get('FLASK_DEBUG', 'False') == 'True'
    app.run(host='0.0.0.0', port=8080, debug=debug_mode)
