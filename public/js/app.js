document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('signup-form');
    const actionInputs = document.querySelectorAll('input[name="action"]');
    const recaptchaContainer = document.getElementById('recaptcha-container');
    const feedbackContainer = document.getElementById('feedback-container');
    const feedbackMessage = document.getElementById('feedback-message');
    const submitBtn = document.getElementById('submit-btn');

    // Initial UI Setup
    const initialAction = document.querySelector('input[name="action"]:checked');
    if (initialAction) {
        initialAction.dispatchEvent(new Event('change'));
    }

    // Fetch and display user count
    async function fetchUserCount() {
        try {
            const response = await fetch('/api/user-count');
            if (response.ok) {
                const data = await response.json();
                const displayElement = document.getElementById('user-count-display');
                if (displayElement) {
                    displayElement.innerHTML = `${data.count.toLocaleString()} active subscribers - <a href="/stats" style="color: inherit; text-decoration: underline;">see more stats</a>`;
                }
            }
        } catch (error) {
            console.error('Error fetching user count:', error);
        }
    }

    fetchUserCount();

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

    // Check URL parameters for action and email
    const urlParams = new URLSearchParams(window.location.search);
    const actionParam = urlParams.get('action');
    const emailParam = urlParams.get('email');

    if (emailParam) {
        document.getElementById('email').value = emailParam;
    }

    if (actionParam === 'unsubscribe') {
        const unsubscribeRadio = document.getElementById('action-remove');
        if (unsubscribeRadio) {
            unsubscribeRadio.checked = true;
            // Trigger change event to update UI
            unsubscribeRadio.dispatchEvent(new Event('change'));
        }
    }

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
        const notes = formData.get('notes');

        try {
            let response;

            if (action === 'signup') {
                // Get Recaptcha Token
                const recaptchaToken = grecaptcha.getResponse();
                if (!recaptchaToken) {
                    showFeedback('Please complete the captcha.', 'error');
                    submitBtn.disabled = false;
                    return;
                }

                // Prepare Signup Payload
                const payload = {
                    email,
                    notes,
                    recaptchaToken
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
                const params = new URLSearchParams({ email, notes });
                response = await fetch(`/unsubscribe?${params.toString()}`, {
                    method: 'GET'
                });
            }

            const resultText = await response.text();

            if (response.ok) {
                showFeedback(resultText, 'success');
                if (action === 'signup') {
                    form.reset();
                    grecaptcha.reset();
                }
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
