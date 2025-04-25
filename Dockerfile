FROM node:22-slim AS build

WORKDIR /app
COPY package*.json ./
RUN npm install

FROM node:22-slim

RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    libtesseract-dev \
    libleptonica-dev \
    build-essential \
    libvips-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY . .
RUN mkdir -p uploads output cache reports

EXPOSE 3000
CMD ["npm", "start"]