const {CompositeDisposable, Disposable, Emitter} = require('via');
const AlertManager = require('./alert-manager');
const AlertCreator = require('./alert-creator');
const Alert = require('./alert');
const _ = require('underscore-plus');
const uri = 'ws://localhost:8080';
const base = 'via://alerts';

const InterfaceConfiguration = {
    manager: {
        name: 'Manage Alerts',
        description: 'View and manage alerts.',
        command: 'alerts:open-manager',
        uri: base + '/manage'
    },
    creator: {
        name: 'Create Alert',
        description: 'Create a new alert.',
        command: 'alerts:open-creator',
        uri: base + '/create'
    }
};

class AlertsPackage {
    activate(){
        this.disposables = new CompositeDisposable();
        this.emitter = new Emitter();
        this.alerts = [];
        this.backlog = [];
        this.manager = null;
        this.creator = null;

        this.ws = via.websockets.create(uri, this.headers.bind(this));
        this.ws.onDidReceiveMessage(this.message.bind(this));

        this.disposables.add(via.markets.onDidCreateMarket(this.process.bind(this)));

        this.disposables.add(via.commands.add('via-workspace', {
            'alerts:open-manager': () => via.workspace.open(`${base}/manage`),
            'alerts:open-creator': () => via.workspace.open(`${base}/create`)
        }));

        this.disposables.add(via.workspace.addOpener(uri => {
            if(uri === `${base}/manage` || uri.startsWith(`${base}/manage/`)){
                if(!this.manager){
                    this.manager = new AlertManager({manager: this, omnibar: this.omnibar, uri});
                }

                return this.manager;
            }
        }, InterfaceConfiguration.manager));

        this.disposables.add(via.workspace.addOpener(uri => {
            if(uri === `${base}/create` || uri.startsWith(`${base}/create/`)){
                if(!this.creator){
                    this.creator = new AlertCreator({manager: this, omnibar: this.omnibar, uri});
                }

                return this.creator;
            }
        }, InterfaceConfiguration.creator));
    }

    all(){
        return this.alerts.slice();
    }

    valid(){
        return this.alerts.filter(alert => alert.isValidAlert());
    }

    headers(){
        return {headers: {authorization: 'Bearer ' + via.user.token}};
    }

    create(params){
        console.log("Creating new alert")
        const alert = new Alert(this, params);
        this.alerts.push(alert);
        this.emitter.emit('did-create-alert', alert);
        return alert;
    }

    find(uuid){
        return this.alerts.find(alert => alert.uuid === uuid);
    }

    update(params){
        const market = via.markets.findByIdentifier(`${params.exchange}/${params.market}`);

        if(market){
            const existing = this.find(params.uuid);

            if(existing){
                existing.update(_.extend(params, {market}));
            }else{
                this.create(_.extend(params, {market}));
            }
        }else{
            const existing = this.backlog.find(alert => alert.uuid === params.uuid);

            if(existing){
                this.backlog.splice(this.backlog.indexOf(existing), 1, params);
            }else{
                this.backlog.push(params);
            }
        }
    }

    message(msg){
        const message = JSON.parse(msg);
        console.log('message');
        console.log(message);

        if(message.type === 'snapshot'){
            for(const alert of this.all()) alert.destroy();

            this.alerts = [];

            for(const alert of message.alerts) this.update(alert);
        }else if(message.type === 'canceled'){
            const alert = this.find(message.uuid);
            if(alert) return alert.destroy();

            const backloggedAlert = this.backlog.find(a => a.uuid === message.uuid);
            if(backloggedAlert) _.remove(this.backlog, backloggedAlert);
        }else{
            this.update(message.alert);
        }
    }

    process(market){
        if(!this.backlog.length) return;

        for(const alert of this.backlog.slice()){
            if(alert.market === market.symbol && alert.exchange === market.exchange.id){
                this.create(_.extend(alert, {market}));
                _.remove(this.backlog, alert);
            }
        }
    }

    consumeActionBar(actionBar){
        this.omnibar = actionBar.omnibar;
    }

    deactivate(){
        if(this.manager) this.manager.destroy();
        if(this.creator) this.creator.destroy();
        if(this.ws) via.websockets.destroy(this.ws);

        for(const alert of this.all()){
            alert.destroy();
        }

        this.disposables.dispose();
        this.emitter.dispose();
    }

    didUpdateAlert(alert){
        this.emitter.emit('did-update-alert', alert);
    }

    didDestroyAlert(alert){
        _.remove(this.alerts, alert);
        this.emitter.emit('did-destroy-alert', alert);
    }

    onDidCreateAlert(callback){
        return this.emitter.on('did-create-alert', callback);
    }

    onDidUpdateAlert(callback){
        return this.emitter.on('did-update-alert', callback);
    }

    onDidDestroyAlert(callback){
        return this.emitter.on('did-destroy-alert', callback);
    }

    onDidTriggerAlert(callback){
        return this.emitter.on('did-trigger-alert', callback);
    }
}

module.exports = new AlertsPackage();