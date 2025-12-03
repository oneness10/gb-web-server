FROM node:19.4-alpine

# パッケージのインストール、タイムゾーンの設定
RUN apk --update --no-cache add tzdata \
  && cp /usr/share/zoneinfo/Asia/Tokyo /etc/localtime \
  && apk del tzdata

# ffmpegのインストール
RUN apk add --update --no-cache ffmpeg