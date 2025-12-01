import unittest
from unittest.mock import patch, MagicMock
import sys
import os

# Add parent directory to path to import main
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app

class EmailWorkerTestCase(unittest.TestCase):
    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True

    @patch('main.mail')
    def test_email_queue_success(self, mock_mail):
        # Mock the EmailMessage class and its send method
        mock_message_instance = MagicMock()
        mock_mail.EmailMessage.return_value = mock_message_instance

        response = self.app.post('/emailqueue', data={
            'email': 'test@example.com',
            'subject': 'Test Subject',
            'body': '<h1>Test Body</h1>',
            'bcc': 'False'
        })

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data.decode('utf-8'), 'Email sent')

        # Verify EmailMessage was initialized and sent
        mock_mail.EmailMessage.assert_called()
        mock_message_instance.send.assert_called_once()
        
        # Verify attributes were set
        self.assertEqual(mock_message_instance.to, 'test@example.com')
        self.assertEqual(mock_message_instance.subject, 'Test Subject')
        self.assertEqual(mock_message_instance.html, '<h1>Test Body</h1>')

    @patch('main.mail')
    def test_email_queue_bcc(self, mock_mail):
        mock_message_instance = MagicMock()
        mock_mail.EmailMessage.return_value = mock_message_instance

        response = self.app.post('/emailqueue', data={
            'email': 'test@example.com',
            'subject': 'APOD Email - Test',
            'body': 'Body',
            'bcc': 'True'
        })

        self.assertEqual(response.status_code, 200)
        # Verify BCC was set
        self.assertEqual(mock_message_instance.bcc, 'gtracy@gmail.com')

    @patch('main.mail')
    def test_email_queue_failure(self, mock_mail):
        # Simulate an exception during send
        mock_message_instance = MagicMock()
        mock_message_instance.send.side_effect = Exception("SMTP Error")
        mock_mail.EmailMessage.return_value = mock_message_instance

        response = self.app.post('/emailqueue', data={
            'email': 'test@example.com',
            'subject': 'Test',
            'body': 'Body'
        })

        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.data.decode('utf-8'), 'Error sending email')

if __name__ == '__main__':
    unittest.main()
