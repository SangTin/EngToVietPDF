FROM node:22-slim

RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    libtesseract-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install
COPY . .
RUN mkdir -p uploads output cache
EXPOSE 3000

CMD ["npm", "start"]