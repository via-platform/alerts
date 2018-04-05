const {CompositeDisposable, Disposable, Emitter} = require('via');
const _ = require('underscore-plus');
const UUID = require('uuid/v1');
const axios = require('axios');

const ALERT_LIFECYCLE = ['loading', 'pending', 'transmitting', 'open', 'updating', 'canceling', 'canceled', 'expired'];
const VALID_ALERT_TYPES = ['value-above', 'value-below', 'value-crosses'];
const VALID_PROPERTIES = ['value', 'created', 'updated', 'status', 'type', 'uuid', 'market'];

const url = 'http://localhost:4300/alerts'

module.exports = class Alert {
    constructor(manager, params = {}){
        this.manager = manager;
        this.emitter = new Emitter();
        this.disposables = null;

        this.initialize(params);
    }

    initialize(params){
        if(params.market) this.market = params.market;

        this._id = params.id;
        this._status = params.status || 'pending';
        this._last = params.last;

        if(this.status === 'loading') return;

        this._value = params.value || 0;
        this._created = params.created ? new Date(params.created) : null;
        this._updated = params.updated ? new Date(params.updated) : null;
        this._expiration = params.expiration ? new Date(params.expiration) : null;
        this._type = params.type;
        this._uuid = params.uuid || UUID();
        this._cooldown = params.cooldown || 0;
    }

    didUpdate(name, value){
        if(name) this.emitter.emit(`did-update-${name}`, value);
        this.emitter.emit('did-update');
        this.manager.didUpdateAlert(this, name, value);
    }

    get market(){
        return this._market;
    }

    get last(){
        return this._last;
    }

    get created(){
        return this._created;
    }

    get updated(){
        return this._updated;
    }

    get expiration(){
        return this._expiration;
    }

    get status(){
        return this._status;
    }

    get type(){
        return this._type;
    }

    get value(){
        return this._value;
    }

    get uuid(){
        return this._uuid;
    }

    get cooldown(){
        return this._cooldown;
    }

    set uuid(uuid){
        return this._uuid = uuid;
    }

    set market(market){
        if(this._market === market) return;
        if(this.disposables) this.disposables.dispose();

        this._market = market;

        if(market){
            //TODO Make sure this market supports alerts
            this.disposables = this._market.onDidDestroy(this.destroy.bind(this));
        }

        this.didUpdate('market', market);
    }

    set type(type){
        if(this._type !== type && VALID_ALERT_TYPES.includes(type)){
            this._type = type;
            this.didUpdate('type', type);

            //Remove extraneous properties to not confuse the user / developer
            //These extra properties wouldn't be sent anyway, but it helps will clarity
            if(this.type === 'market'){
                this.limit = undefined;
                this.stop = undefined;
            }else if(this.type === 'limit'){
                this.stop = undefined;
            }
        }
    }

    set value(value){
        if(this._value === value) return;
        if(_.isNumber(value) && value < 0) return console.warn('Cannot set value to less than zero.');
        this._value = _.isNumber(value) ? value : 0;
        this.didUpdate('value', value);
    }

    set cooldown(value){
        if(this._cooldown === value) return;
        if(_.isNumber(value) && value < 0) return console.warn('Cannot set cooldown to less than zero.');
        this._value = _.isNumber(value) ? value : 0;
        this.didUpdate('cooldown', value);
    }

    set status(status){
        //Return if we're already past here in the alert lifecycle
        if(ALERT_LIFECYCLE.indexOf(this.status) >= ALERT_LIFECYCLE.indexOf(status)){
            console.log('refused to change', this.status, status);
            return;
        }

        const previous = status;
        this._status = status;
        this.didUpdate('status', status);
    }

    set created(date){
        if(this._created === date) return;
        this._created = date;
        this.didUpdate('created', date);
    }

    set expiration(date){
        if(this._expiration === date) return;
        this._expiration = date;
        this.didUpdate('expiration', date);
    }

    isValidValue(){
        //If this.value...
        return (
            !_.isUndefined(this.value) && //Is not undefined
            _.isNumber(this.value) && //Is a number
            !_.isNaN(this.value) && //Is not NaN
            this.value > 0 //Is greater than 0
        );
    }

    exchangeSupportsAlertType(){
        if(!this.market) return false;

        //TODO This

        switch(this.type){
            case 'value-above':     return true;
            case 'value-below':     return true;
            case 'value-crosses':   return true;
            default:                return true;
        }
    }

    isValidAlert(){
        if(!this.market) return false;
        if(!ALERT_LIFECYCLE.includes(this.status)) return false;
        if(!VALID_ALERT_TYPES.includes(this.type)) return false;

        return this.exchangeSupportsAlertType() && this.isValidValue();
    }

    transmit(){
        if(this.status !== 'pending'){
            throw new Error('This alert cannot be transmitted again.');
        }

        if(!this.market){
            throw new Error('Alerts must contain a valid market.');
        }

        if(!this.isValidAlert()){
            throw new Error('This is not a valid alert.');
        }

        this.emitter.emit('will-transmit');
        this.status = 'transmitting';

        return axios.post(url,
            {value: this.value, type: this.type, uuid: this.uuid, market: this.market.id, exchange: this.market.exchange.id},
            {headers: {authorization: 'Bearer ' + via.user.token}}
        )
        .then(res => {
            this.created = res.data.created;
            this.status = 'open';
            this.emitter.emit('did-transmit');
        })
        .catch(err => {
            this._status = 'pending';
            this.didUpdate('status', 'pending');
            this.emitter.emit('did-transmit-error');
            console.error(err);
        });
    }

    cancel(confirm = via.config.get('core.confirmCancelAlert')){
        if(ALERT_LIFECYCLE.indexOf(this.status) < ALERT_LIFECYCLE.indexOf('open')){
            //This alert has not yet been created on the server, so just destroy it
            return this.destroy();
        }

        if(confirm){
            const confirmed = via.confirm({
                message: 'Remove Alert',
                detail: 'Are you sure you want to cancel this alert?',
                buttons: ['Do Nothing', 'Cancel Alert'],
                defaultId: 1,
                cancelId: 0
            });

            if(!confirmed) return;
        }

        this.emitter.emit('will-cancel');
        this.status = 'canceling';

        return axios.delete(`${url}/${this.uuid}`, {headers: {authorization: 'Bearer ' + via.user.token}})
        .then(res => {
            this.status = 'canceled';
            this.emitter.emit('did-cancel');
        })
        .catch(err => {
            this._status = 'open';
            this.didUpdate('status', 'open');
            console.error(err);
        });
    }

    update(properties){
        for(const [property, value] of Object.entries(properties)){
            if(VALID_PROPERTIES.includes(property)) this[property] = value;
        }
    }

    fill(params){
        //Handle a fill event
        const fill = new Fill(this, params);
        this.fills.push(fill);
        this.didUpdate('fills', fill);
    }

    filled(){
        //Set the status to filled and fetch any fills associated with this alert
        this.status = 'filled';
    }

    change(event){
        //Handle a change event, where the alert has been modified by the server
    }

    activate(){
        //A stop alert has been activated
        if(this.type.indexOf('stop-')) return;
        this.type = this.type.replace('stop-', '');
        this.status = 'open';
    }

    notify(){
        if(this.status === 'canceled' && via.config.get('core.notifyCanceledAlert')){
            via.notifications.notify('Alert Canceled', {body: `Alert was successfully canceled.`});
        }

        if(this.status === 'expired' && via.config.get('core.notifyExpiredAlert')){
            const currency = (this.type.indexOf('limit') !== -1) ? this.market.base : this.market.quote;
            const body = `Your ${this.type.toUpperCase()} alert to ${this.side.toUpperCase()} ${this.amount} ${currency} has expired.`;
            via.notifications.notify('Alert Expired', {body});
        }

        if(this.status === 'open' && via.config.get('core.notifyPlacedAlert')){
            const currency = (this.type.indexOf('limit') !== -1) ? this.market.base : this.market.quote;
            const body = `Transmitted ${this.type.toUpperCase()} alert to ${this.side.toUpperCase()} ${this.amount} ${currency}.`;
            via.notifications.notify('Alert Placed', {body});
        }
    }

    destroy(){
        this.emitter.emit('did-destroy');
        if(this.disposables) this.disposables.dispose();
        this.emitter.dispose();
        this.manager.didDestroyAlert(this);
    }

    onWillCancel(callback){
        return this.emitter.on('will-cancel', callback);
    }

    onDidCancel(callback){
        return this.emitter.on('did-cancel', callback);
    }

    onDidUpdateStatus(callback){
        return this.emitter.on('did-update-status', callback);
    }

    onDidUpdate(callback){
        return this.emitter.on('did-update', callback);
    }

    onDidUpdateType(callback){
        return this.emitter.on('did-update-type', callback);
    }

    onDidUpdateValue(callback){
        return this.emitter.on('did-update-value', callback);
    }

    onDidUpdateMarket(callback){
        return this.emitter.on('did-update-market', callback);
    }

    onWillTransmit(callback){
        return this.emitter.on('will-transmit', callback);
    }

    onDidTransmit(callback){
        return this.emitter.on('did-transmit', callback);
    }

    onDidTransmitError(callback){
        return this.emitter.on('did-transmit-error', callback);
    }

    onDidDestroy(callback){
        return this.emitter.on('did-destroy', callback);
    }
}
