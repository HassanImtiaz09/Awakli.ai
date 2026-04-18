# Modal Research for Awakli

## Plans & Pricing

### Starter Plan - $0/month + compute
- $30/month free credits included
- 3 workspace seats
- 100 containers + 10 GPU concurrency
- Crons and web endpoints (limited)
- Real-time metrics and logs
- Region selection

### Team Plan - $250/month + compute
- $100/month free credits included
- Unlimited seats
- 1000 containers + 50 GPU concurrency
- Unlimited crons and web endpoints
- Custom domains
- Static IP proxy
- Deployment rollbacks

### Enterprise - Custom pricing
- Volume-based discounts
- Unlimited seats
- Higher GPU concurrency
- Embedded ML engineering services
- Support via private Slack
- Audit logs, Okta SSO, HIPAA

## GPU Pricing (per second billing)
- Nvidia B200: $0.001736/sec ($6.25/hr)
- Nvidia H200: $0.001261/sec ($4.54/hr)
- Nvidia H100: $0.001097/sec ($3.95/hr)
- Nvidia RTX PRO 6000: $0.000842/sec ($3.03/hr)
- Nvidia A100 80GB: $0.000694/sec ($2.50/hr)
- Nvidia A100 40GB: $0.000583/sec ($2.10/hr)
- Nvidia L40S: $0.000542/sec ($1.95/hr)
- Nvidia A10: $0.000306/sec ($1.10/hr)
- Nvidia L4: $0.000222/sec ($0.80/hr)
- Nvidia T4: $0.000164/sec ($0.59/hr)

## API Key / Token Setup
- Two credentials needed: MODAL_TOKEN_ID and MODAL_TOKEN_SECRET
- Method 1 (CLI): `pip install modal` → `modal setup` (opens browser for auth)
- Method 2 (CLI): `modal token new` (creates token via browser session)
- Method 3 (Dashboard): Go to workspace tokens settings page → New Service User → get MODAL_TOKEN_ID and MODAL_TOKEN_SECRET
- Dashboard URL: https://modal.com/settings/tokens/service-users
- Important: Token secret is shown only once at creation time

## LoRA Training on Modal
- Flux LoRA fine-tune: ~$2 on 1x A100 for 4000 steps (rank 16)
- A100 40GB sufficient for LoRA fine-tuning without quantization
- Sub-second cold starts for GPU containers
- Native support for diffusion model LoRA training (Dreambooth, diffusers)
- Has official example: "Fine-tune Flux with LoRA" and "Star in custom music videos" (Wan2.1 video model)
- Wan 2.1 video model fine-tuning example exists on Modal

## Startup Credits
- Up to $25k free compute credits for early-stage startups
- Up to $10k for academics/researchers

## Key for Awakli
- Modal has a Wan 2.1 video model fine-tuning example already
- A100 80GB at $2.50/hr is the sweet spot for motion LoRA training
- Estimated cost per training job: ~$2-5 for 3500 steps on A100
- Starter plan ($0/month + $30 free credits) is enough for initial testing
- Team plan ($250/month + $100 free credits) for production scale
