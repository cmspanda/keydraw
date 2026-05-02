FROM nginx:1.27-alpine

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom config template (uses $PORT env var)
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Copy static files
COPY index.html /usr/share/nginx/html/index.html
COPY style.css  /usr/share/nginx/html/style.css
COPY app.js     /usr/share/nginx/html/app.js

# Cloud Run provides PORT env var, default to 8080
ENV PORT=8080
EXPOSE 8080
