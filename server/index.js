/**
 * Copyright 2017 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

require('isomorphic-fetch');
const queryString = require('query-string');
const queryBuilder = require('./query-builder');
const discovery = require('./watson-discovery-service');

/**
 * Back end server which handles initializing the Watson Discovery
 * service, and setting up route methods to handle client requests.
 */

/*eslint no-unused-vars: ["error", {"argsIgnorePattern": "response"}]*/
const WatsonDiscoServer = new Promise((resolve, reject) => {
  // getInvironments as sanity check to ensure creds are valid
  discovery.getEnvironments({})
    .then(response => {
      // environment and collection ids are always the same for Watson News
      const environmentId = discovery.environmentId;
      const collectionId = discovery.collectionId;
      queryBuilder.setEnvironmentId(environmentId);
      queryBuilder.setCollectionId(collectionId);
    })
    .then(response => {
      // this is the inital query to the discovery service
      const params = queryBuilder.search({ 
        natural_language_query: '',
        count: 1000
      });
      return new Promise((resolve, reject) => {
        discovery.query(params)
        .then(response =>  {
          resolve(response);
        })
        .catch(error => {
          console.error(error);
          reject(error);
        });
      });
    })
    .then(response => {
      // console.log("GOT DATA!!!! " + util.inspect(response, false, null));
      resolve(createServer(response));
    })
    .catch(error => {
      // eslint-disable-next-line no-console
      console.error(error);
      reject(error);
    });
});

/**
 * createServer - create express server and handle requests
 * from client.
 */
function createServer(results) {
  const server = require('./express');

  // handles search request from search bar
  server.get('/api/search', (req, res) => {
    const { query, filters, count, returnPassages, queryType } = req.query;
    var params;
    
    if (queryType == 'natural_language_query') {
      params = queryBuilder.search({
        natural_language_query: query,
        filter: filters,
        count: count
      });
    } else {
      params = queryBuilder.search({
        query: query,
        filter: filters,
        count: count
      });
    }        

    discovery.query(params)
      .then(response => res.json(response))
      .catch(error => {
        if (error.message === 'Number of free queries per month exceeded') {
          res.status(429).json(error);
        } else {
          res.status(error.code).json(error);
        }
      });
  });

  // handles search string appened to url
  server.get('/:searchQuery', function(req, res){
    var searchQuery = req.params.searchQuery.replace(/\+/g, ' ');
    const qs = queryString.stringify({ query: searchQuery });
    const fullUrl = req.protocol + '://' + req.get('host');

    console.log('In /:search: query = ' + qs);

    fetch(fullUrl + `/api/search?${qs}`)
      .then(response => {
        if (response.ok) {
          return response.json();
        } else {
          throw response;
        }
      })
      .then(json => {
        res.render('index', { entities: json, 
          categories: json, 
          concepts: json, 
          data: json, 
          searchQuery, 
          numMatches: json.matching_results,
          error: null
        });
      })
      .catch(response => {
        res.status(response.status).render('index', {
          error: (response.status === 429) ? 'Number of free queries per month exceeded' : 'Error fetching data'
        });
      });
  });

  // initial start-up request
  server.get('/*', function(req, res) {
    console.log('In /*');
    res.render('index', { data: results, 
      entities: results,
      categories: results,
      concepts: results,
      numMatches: results.matching_results
    });
  });

  return server;
}

module.exports = WatsonDiscoServer;
