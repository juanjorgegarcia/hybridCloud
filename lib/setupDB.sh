#!/bin/bash
cd home/ubuntu
sudo apt-get update
sudo apt install -y mongodb
sed -i 's/bind_ip = 127.0.0.1/bind_ip = 0.0.0.0/g' /etc/mongodb.conf
sudo systemctl restart mongodb
