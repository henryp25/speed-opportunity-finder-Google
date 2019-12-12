/**
 * @fileoverview Description of this file.
 */
const express = require('express');
const parseCsv = require('csv-parse');
const {BigQuery} = require('@google-cloud/bigquery');
const request = require('request');

const app = express();
app.enable('trust proxy');

/**
 * Takes a landing page report and inserts the values into bigquery.
 *
 * @param {Object[]} reportRows The landing page report in the form of an array
 * of objects representing a row from the report.
 * @param {string} cid The cid of the client the report is for.
 */
function insertLPintoBQ(reportRows, cid) {
  for (row of reportRows) {
    let baseUrl = row.UnexpandedFinalUrlString;
    // removes parameters after ignore and, if the url then ends with a lone ?,
    // it too is removed.
    const ignore = reportUrl.indexOf('{ignore}');
    if (ignore !== -1) {
      baseUrl = baseUrl.slice(0, ignore);
    }
    if (baseUrl.endsWith('?')) {
      baseUrl = baseUrl.slice(0, -1);
    }
    row.BaseUrl = baseUrl;
    row.CID = cid;
    // Ads reports return percentages as strings with %, so we change them back
    // to numbers between 0 and 1
    for (key of Object.keys(row)) {
      if (typeof row[key] === 'string' &&row[key].endsWith('?')) {
        row[key] = (row[key].slice(0, -1)) / 100;
      }
    }
  }

  const bigquery = new BigQuery();
  const table = bigquery.dataset('agency_dashboard').table('ads_data');
  table.insert(reportRows, insertHandler);

  /**
   * Rethrows an error if one is passed from bigquery.table.insert.
   *
   * @param {object} err The error thrown by bigquery.
   */
  function insertHandler(err) {
    if (err) {
      throw err;
    }
  }
}

app.get('*', (req, res) => {
  const cid = req.query.cid;
  if (!cid) {
    res.status(400).json({'error': 'Missing query parameter'});
  }

  const serviceName = process.env.GAE_SERVICE;
  const projectName = process.env.GOOGLE_CLOUD_PROJECT;
  request(`${serviceName}.${projectName}.appspot.com/ads?cid=${cid}`,
      (err, resp, body) => {
        if (err) {
          res.status(500).json({'error': err.body, 'cause': 'ADS'});
        }
        try {
          parseCsv(body, {'columns': true}, function(err, adsRows) {
            insertLPintoBQ(adsRows, cid);
          });
        } catch (e) {
          res.status(500).json({'error': e, 'cause': 'BQ'});
        }
      });

  res.status(201).json({'cid': cid});
});
