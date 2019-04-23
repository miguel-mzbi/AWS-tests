const AWS = require('aws-sdk');
const dotenv = require('dotenv').config();
const stringSimilarity = require('string-similarity');
const fs = require('fs');

const rekognition = new AWS.Rekognition({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const selfie1 = 'selfie1.jpg';
const selfie2 = 'selfie2.jpg';
const passport = 'passport.jpg';
const ineF = 'ineF.jpg';
const ineR = 'ineR.jpg';
const ineF2 = 'ineF2.jpg';

const selfie1_BM = fs.readFileSync(`./input/${selfie1}`);
const selfie2_BM = fs.readFileSync(`./input/${selfie2}`);
const ineF_BM = fs.readFileSync(`./input/${ineF}`);
const ineF2_BM = fs.readFileSync(`./input/${ineF2}`);
const ineR_BM = fs.readFileSync(`./input/${ineR}`);
const passport_BM = fs.readFileSync(`./input/${passport}`);

// Select photos to use
const selfieBM = selfie1_BM;
const identificationBM = ineF2_BM;
// Build payloads. Payload can contain photo location in an S3 bucket.
let selfieJSON = {
  Image: {
    Bytes: Buffer.from(selfieBM)
  },
}

let identificationJSON = {
  Image: {
    Bytes: Buffer.from(identificationBM)
  },
}

let comparisonJSON = {
  TargetImage: {
    Bytes: Buffer.from(identificationBM)
  },
  SourceImage: {
    Bytes: Buffer.from(selfieBM)
  }
}

checkImages();

async function checkImages() {

  let validSelfie = false;
  let validId = false;
  let validFaceMatch = false;

  console.log("Checking if uploaded ID card photo contains an ID card or passport.");
  const checkId = rekognition.detectLabels(identificationJSON).promise();
  await checkId.then(data => {
    const labels = data.Labels;
    if (labels.some(label => {
      if (label.Name == "Passport" && label.Confidence > 75) {
        console.log("Most likely a passport.");
        return true;
      }
      else if (label.Name == "Id Cards" && label.Confidence > 75) {
        console.log("Most likely an ID card.");
        return true;
      }
    })) {
      console.log("Identification found.");
      validId = true;
    }
    else {
      console.log("Identification not found.");
    }
  });
  
  console.log("\nChecking if uploaded selfie photo contains an human showing its face.");
  const checkSelfie = rekognition.detectFaces(selfieJSON).promise();
  await checkSelfie.then(data => {    
    const faces = data.FaceDetails;
    if (faces.some(face => {
      if (face.Confidence > 75) {
        console.log("Most likely contains a face.");
        return true;
      }
    })) {
      console.log("Valid selfie.");
      validSelfie = true;
    }
    else {
      console.log("Human showing face not found.");
    }
  });

  console.log("\nIf valid selfie and ID, will try to do face match.");
  if (validId && validSelfie) {
    const checkFaceMatch = rekognition.compareFaces(comparisonJSON).promise();
    await checkFaceMatch.then(data => {
      const faces = data.FaceMatches;
      if (faces.some(face => {
        if(face.Similarity > 75) {
          console.log(`Face match with ${face.Similarity}% similarity.`);
          return true;
        }
      })) {
        console.log("Faces matched.");
        validFaceMatch = true;
      }
      else {
        console.log("No match detected above 75%");
      }
    });
  }

  console.log("\nIf valid ID, will try to detect text.");
  if (validId) {
    const checkIdText = rekognition.detectText(identificationJSON).promise();
    await checkIdText.then(data => {
      let idType;
      const textDetections = data.TextDetections;
      if(textDetections.some(text => {
        if(stringSimilarity.compareTwoStrings(text.DetectedText.toLowerCase(), 'instituto nacional electoral') >= 0.8) {
          idType = "INE";
          return true;
        }
        else if(stringSimilarity.compareTwoStrings(text.DetectedText.toLowerCase(), 'secretaria de movilidad') >= 0.8) {
          idType = "DRIVER";
          return true;
        }
        else if(stringSimilarity.compareTwoStrings(text.DetectedText.toLowerCase(), 'pasaporte') >= 0.8) {
          idType = "PASSPORT";
          return true;
        }
      })) {
        if(idType == "INE") {
          console.log("Found INE.");
          const nameHeaderComponent = textDetections.find(text => {
            return stringSimilarity.compareTwoStrings(text.DetectedText.toLowerCase(), 'nombre') >= 0.8
          })
          const firstSurnameAndBirthID = nameHeaderComponent.ParentId+1;
          const secondSurnameAndSexID = nameHeaderComponent.ParentId+2;
          const nameID = nameHeaderComponent.ParentId+4;

          const firstSurnameAndBirthComponent = textDetections[firstSurnameAndBirthID];
          const secondSurnameAndSexComponent = textDetections[secondSurnameAndSexID];
          const nameComponent = textDetections[nameID];

          const firstSurnameAndBirthArray = firstSurnameAndBirthComponent.DetectedText.split(' ');
          const dob = firstSurnameAndBirthArray.pop();
          const firstSurname = firstSurnameAndBirthArray.join(' ');
          const secondSurnameAndSexArray = secondSurnameAndSexComponent.DetectedText.split(' ');
          const sex = secondSurnameAndSexArray.pop();
          secondSurnameAndSexArray.pop();
          const secondSurname = secondSurnameAndSexArray.join(' ');
          const name = nameComponent.DetectedText;

          console.log(`Name: ${name}`)
          console.log(`First Surname: ${firstSurname}`);
          console.log(`Second Surname: ${secondSurname}`);
          console.log(`Sex: ${sex}`);
          console.log(`DOB: ${dob}`);
        }
        else if(idType == "DRIVER") {
          console.log("Found driver's licence.");
        }
        else if(idType == "PASSPORT") {
          console.log("Found passport.");
        }
      }
      else {
        console.log("invalid ID card.");
      }
    });
  }
}


