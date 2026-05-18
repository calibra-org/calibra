FROM wordpress:6.7-php8.3-apache

RUN apt-get update \
    && apt-get install -y --no-install-recommends less \
    && rm -rf /var/lib/apt/lists/*

RUN curl -L https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar -o /usr/local/bin/wp \
    && chmod +x /usr/local/bin/wp

COPY mu-bootstrap.php /usr/src/wordpress/wp-content/mu-plugins/000-bootstrap.php

EXPOSE 80
