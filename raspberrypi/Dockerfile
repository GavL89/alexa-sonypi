FROM node

WORKDIR /iot

COPY connect_device_package .
RUN sh ./configure.sh
RUN npm install

CMD ["node", "src/tvcontrol.js", "--host-name=a22oupnhjvcdu8-ats.iot.ap-southeast-2.amazonaws.com", "--private-key=MyIotThing.private.key", "--client-certificate=MyIotThing.cert.pem", "--ca-certificate=root-CA.crt", "--client-id=sdk-nodejs-f1499cff-42fc-44d0-8fed-ee468c8f08b5"]