document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('signup-form');
    const actionInputs = document.querySelectorAll('input[name="action"]');
    const recaptchaContainer = document.getElementById('recaptcha-container');
    const feedbackContainer = document.getElementById('feedback-container');
    const feedbackMessage = document.getElementById('feedback-message');
    const submitBtn = document.getElementById('submit-btn');

    // Toggle UI based on action (Signup vs Remove)
    actionInputs.forEach(input => {
        input.addEventListener('change', (e) => {
            if (e.target.value === 'signup') {
                recaptchaContainer.style.display = 'block';
                feedbackContainer.style.display = 'none';
                submitBtn.textContent = 'Subscribe';
            } else {
                recaptchaContainer.style.display = 'none';
                feedbackContainer.style.display = 'block';
                submitBtn.textContent = 'Unsubscribe';
            }
        });
    });

    // Handle Form Submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Reset feedback
        feedbackMessage.style.display = 'none';
        feedbackMessage.className = '';
        submitBtn.disabled = true;

        const formData = new FormData(form);
        const action = formData.get('action');
        const email = formData.get('email');
        const referral = formData.get('referral');
        const notes = formData.get('notes');

        try {
            let response;

            if (action === 'signup') {
                // Prepare Signup Payload
                const payload = {
                    email,
                    referral,
                    notes
                };

                response = await fetch('/signup', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

            } else {
                // Prepare Unsubscribe Payload (GET request as per API)
                const params = new URLSearchParams({ email });
                response = await fetch(`/unsubscribe?${params.toString()}`, {
                    method: 'GET'
                });
            }

            const resultText = await response.text();

            if (response.ok) {
                showFeedback(resultText, 'success');
                if (action === 'signup') form.reset();
            } else {
                showFeedback(resultText || 'An error occurred. Please try again.', 'error');
            }

        } catch (error) {
            console.error('Error:', error);
            showFeedback('Network error. Please try again later.', 'error');
        } finally {
            submitBtn.disabled = false;
        }
    });

    function showFeedback(message, type) {
        feedbackMessage.textContent = message;
        feedbackMessage.className = type === 'success' ? 'feedback-success' : 'feedback-error';
        feedbackMessage.style.display = 'block';
    }
});

// Placeholder for Recaptcha callback if needed
window.onRecaptchaLoad = function () {
    console.log('Recaptcha loaded');
};
