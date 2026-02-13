FROM node:18-alpine
WORKDIR /usr/src/app
COPY ../../package*.json ../../package-lock.json /usr/src/app/
RUN npm install --production
COPY . /usr/src/app
ENV OPENCLAW_EXECUTE=false
EXPOSE 9800
CMD ["node", "agent.js"]
