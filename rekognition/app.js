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
const ineF1 = 'ineF1.jpg';
const ineF2 = 'ineF2.jpg';
const ineF3 = 'ineF3.jpg';
const ineR = 'ineR.jpg';

const selfie1_BM = fs.readFileSync(`./input/${selfie1}`);
const selfie2_BM = fs.readFileSync(`./input/${selfie2}`);
const ineF1_BM = fs.readFileSync(`./input/${ineF1}`);
const ineF2_BM = fs.readFileSync(`./input/${ineF2}`);
const ineF3_BM = fs.readFileSync(`./input/${ineF3}`);
const ineR_BM = fs.readFileSync(`./input/${ineR}`);
const passport_BM = fs.readFileSync(`./input/${passport}`);

// Select photos to use
const selfieBM = selfie1_BM;
const identificationBM = ineF2_BM;
// Build payloads. Payload can contain photo location in an S3 bucket.
const selfieJSON = {
  Image: {
    Bytes: Buffer.from(selfieBM)
  },
}

const identificationJSON = {
  Image: {
    Bytes: Buffer.from(identificationBM)
  },
}

const comparisonJSON = {
  TargetImage: {
    Bytes: Buffer.from(identificationBM)
  },
  SourceImage: {
    Bytes: Buffer.from(selfieBM)
  }
}
// INE relative positions of elements
const ineElements = {
  firstSurname: {
    left: 0.344657804,
    top: 0.30816641
  },
  secondSurname: {
    left: 0.344657804,
    top: 0.352465331
  },
  name: {
    left: 0.344657804,
    top: 0.403697997
  },
  streetNumber: {
    left: 0.344657804,
    top: 0.506548536209553
  },
  municipalityZIP: {
    left: 0.344657804,
    top: 0.552773497688752
  },
  districtState: {
    left: 0.344657804,
    top: 0.602850539291217
  },
  curp: {
    left: 0.40201871,
    top: 0.731895223420647
  },
  dob: {
    left: 0.841949778,
    top: 0.302388289676425
  },
  sex: {
    left: 0.952732644,
    top: 0.356317411402157
  },
}

checkImages();

function insideBox(boundingBox, position, idSize) {
  const topFromId = idSize.Height * position.top;
  const leftFromId = idSize.Width * position.left;
  const topFromImage = idSize.Top + topFromId;
  const leftFromImage = idSize.Left + leftFromId;

  if(boundingBox.Left <= leftFromImage && leftFromImage <= boundingBox.Left + boundingBox.Width
    && boundingBox.Top <= topFromImage && topFromImage <= boundingBox.Top + boundingBox.Height) {
    return true;
  }
  else {
    return false;
  }
}

async function detectVariable(textDetections, ineElement, idSize) {
  let value;
  await textDetections.some(text => {
    const textBoundingBox = text.Geometry.BoundingBox;
    if(insideBox(textBoundingBox, ineElement, idSize)) {
      value = text.DetectedText;
      return true;
    }
  });
  return value;
}

async function checkImages() {

  let validSelfie = false;
  let validId = false;
  let idSize;

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
        idSize = label.Instances[0].BoundingBox;
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
      })) {
        if(idType == "INE") {
          console.log("Found INE.");

          detectVariable(textDetections, ineElements.name, idSize).then(field => console.log(`Name: ${field}`));
          detectVariable(textDetections, ineElements.firstSurname, idSize).then(field => console.log(`First surname: ${field}`));
          detectVariable(textDetections, ineElements.secondSurname, idSize).then(field => {
            if (typeof field === 'undefined') {
              console.log(`Second surname: ${field}`)
              return;
            }
            const fieldArray = field.split(' ');
            if(fieldArray.length > 1) {
              console.log(`Second surname: ${fieldArray[0]}`)
            }
            else {
              console.log(`Second surname: ${field}`)
            }
          });
          detectVariable(textDetections, ineElements.streetNumber, idSize).then(field => console.log(`Street & Number: ${field}`));
          detectVariable(textDetections, ineElements.municipalityZIP, idSize).then(field => console.log(`Municipality & ZIP: ${field}`));
          detectVariable(textDetections, ineElements.districtState, idSize).then(field => console.log(`District & State: ${field}`));
          detectVariable(textDetections, ineElements.curp, idSize).then(field => {
            if (typeof field === 'undefined') {
              console.log(`CURP: ${field}`)
              return;
            }
            const fieldArray = field.split(' ');
            if(fieldArray.length > 1) {
              console.log(`CURP: ${fieldArray[0]}`)
            }
            else {
              console.log(`CURP: ${field}`)
            }
          });
          detectVariable(textDetections, ineElements.dob, idSize).then(field => console.log(`DOB: ${field}`));
          detectVariable(textDetections, ineElements.sex, idSize).then(field => {
            if (typeof field === 'undefined') {
              console.log(`Sex: ${field}`)
              return;
            }
            const fieldArray = field.split(' ');
            if(fieldArray.length > 1) {
              console.log(`Sex: ${fieldArray.pop()}`)
            }
            else {
              console.log(`Sex: ${field}`)
            }
          });
        }
      }
      else {
        console.log("Invalid ID card.");
      }
    });
  }
}


