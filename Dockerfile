# 使用基于 Debian 的官方 Node.js 20 slim 镜像
FROM node:20-slim

# 设置工作目录
WORKDIR /app

# 全局安装 wrangler
RUN npm install -g wrangler

# 复制项目文件
COPY . .

# 暴露 wrangler dev 使用的端口
EXPOSE 8080

# 设置容器启动命令
CMD ["wrangler", "dev", "--ip", "0.0.0.0", "--port", "8080"]
