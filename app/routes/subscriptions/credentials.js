import Ember from 'ember';
import request from 'ic-ajax';

export default Ember.Route.extend({

  model() {
    // Verify isAuthenticated: true is accurate, since Satellite session may have changed
    const sessionPortal =  this.modelFor('subscriptions').sessionPortal;
    const cachedIsAuthenticated = sessionPortal.get('isAuthenticated');

    if (cachedIsAuthenticated) {
      return this.confirmAuthenticated(sessionPortal)
        .then((isAuthenticated) => {
          if(isAuthenticated) {
            return sessionPortal;
          } else {
            sessionPortal.set('isAuthenticated', false);
            return sessionPortal.save();
          }
        });
    } else {
      return Ember.RSVP.resolve(sessionPortal);
    }
  },

  setupController(controller, model) {
    controller.set('model', model);
    controller.set('showErrorMessage', false);
  },

  deactivate() {
    this.send('saveDeployment', null);
  },

  actions: {
    error() {
      // bubble up this error event:
      return true;
    },

    loginPortal() {
      var self = this;
      var controller = this.controllerFor('subscriptions/credentials');
      var identification = controller.get('model.identification');
      var password = controller.get('model.password');
      var token = Ember.$('meta[name="csrf-token"]').attr('content');

      controller.set('nextButtonTitle', "Logging in ...");
      controller.set('disableCredentialsNext', true);

      request({
        url: window.fusorServer + '/fusor/api/v21/customer_portal/login/',
        type: "POST",
        data: JSON.stringify({username: identification, password: password}),
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-CSRF-Token": token
        }
      }).then(function(response) {
        //show always be {} empty successful 200 response
        self.send('saveCredentials');
      }, function(error) {
        controller.set('nextButtonTitle', "Next");
        controller.set('disableCredentialsNext', false);
        self.send('error');
      });
    },

    logoutPortal() {
      request({
        url: window.fusorServer + '/fusor/api/v21/customer_portal/logout/',
        type: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-CSRF-Token": Ember.$('meta[name="csrf-token"]').attr('content')
        }
      }).then(response => {
        //show always be {} empty successful 200 response
        this.clearSessionPortal();
        return this.clearDeploymentInfo();
      }).then(deployment => {
        return this.getSubscriptions(deployment);
      }).then(subscriptions => {
        return this.deleteSubscriptions(subscriptions);
      }).catch(error => {
        this.send('error');
      });
    },

    saveCredentials() {
      var self = this;
      var controller = this.controllerFor('subscriptions/credentials');
      var identification = controller.get('model.identification');
      var password = controller.get('model.password');
      var sessionPortal = this.modelFor('subscriptions').sessionPortal;
      if (sessionPortal) {
        sessionPortal.set('identification', identification);
        sessionPortal.set('password', password);
      } else {
        sessionPortal = self.store.createRecord('session-portal', {identification: identification, password: password});
      }
      sessionPortal.save().then(function(result) {
        controller.set('showErrorMessage',false);
        self.send('authenticatePortal');
      }, function(response) {
        controller.set('nextButtonTitle', "Next");
        controller.set('disableCredentialsNext', false);
        self.send('error');
      });
    },

    authenticatePortal() {
      var controller = this.controllerFor('subscriptions/credentials');
      var identification = controller.get('model.identification');
      var password = controller.get('model.password');
      var token = Ember.$('meta[name="csrf-token"]').attr('content');
      var self = this;
      var url = window.fusorServer +
                '/fusor/api/v21/customer_portal/users/' +
                identification +
                "/owners" +
                '?username=' +
                identification +
                '&password=' +
                password;

      return new Ember.RSVP.Promise(function (resolve, reject) {
        request({
          url: url,
          type: "GET",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-CSRF-Token": token
          }
        }).then(function(response) {
          var ownerKey = response[0]['key'];
          var sessionPortal = self.modelFor('subscriptions').sessionPortal;
          sessionPortal.set('ownerKey', ownerKey);
          sessionPortal.set('isAuthenticated', true);
          sessionPortal.save().then(function(result) {
            controller.set('nextButtonTitle', "Next");
            controller.set('disableCredentialsNext', false);
            self.transitionTo('subscriptions.management-application');
          }, function(response) {
            controller.set('nextButtonTitle', "Next");
            controller.set('disableCredentialsNext', false);
          });
        }, function(response) {
          controller.set('nextButtonTitle', "Next");
          controller.set('disableCredentialsNext', false);
          controller.setProperties({
            'showErrorMessage': true,
            'errorMsg': 'Your username or password is incorrect. Please try again.'
          });
        });
      });
    },

    redirectToManagementApplication() {
      this.transitionTo('subscriptions.management-application');
    }
  },

  clearSessionPortal() {
    const sessionPortal = this.modelFor('subscriptions').sessionPortal;
    sessionPortal.setProperties({
      'isAuthenticated': false,
      'identification': null,
      'ownerKey': null,
      'consumerUUID': null
    });
    this.set('controller.password', null);
    sessionPortal.save();
  },

  clearDeploymentInfo() {
    let deployment = this.modelFor('deployment');
    this.set('controller.password', null);

    deployment.set('upstream_consumer_uuid', null);
    deployment.set('upstream_consumer_name', null);
    return deployment.save();
  },

  getSubscriptions(deployment) {
    return this.store.query('subscription', {deployment_id: deployment.get('id')});
  },

  deleteSubscriptions(subscriptions) {
    return Ember.RSVP.all(subscriptions.map(subscription => subscription.destroyRecord()));
  },

  confirmAuthenticated(sessionPortal) {
    // If we've previously authenticated, we should find `isAuthenticated`
    // to be true on the session portal that was saved to local storage on
    // a previous login success. This method is called to confirm that our
    // session is still valid, and if not, sets the local storage value to false
    return new Ember.RSVP.Promise((resolve, reject) => {
      const urlVerify = window.fusorServer + '/fusor/api/v21/customer_portal/is_authenticated';

      Ember.$.getJSON(urlVerify).then(
        (response) => resolve(response), () => resolve(false));
    });
  }
});
